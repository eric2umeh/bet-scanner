"""
Phase 15B — confidence for scouted booking codes.

Score only when:
  - parsed legs exist (matched to stored odds when possible), or
  - rich meta exists (folds + combined odds).

Otherwise: Unverified — copy only. (no fake %).
"""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import Match
from app.models.scout_code import ScoutedCode
from app.services.code_parse import parse_slip_text
from app.services.scout_risk_edit import build_safety_edits

UNVERIFIED_LABEL = "Unverified — copy only."
VERIFICATION_UNVERIFIED = "unverified"
VERIFICATION_LEGS = "legs"
VERIFICATION_RICH = "rich_meta"

_FOLDS_RE = re.compile(r"\b(\d{1,2})\s*[-\s]?\s*folds?\b", re.I)


def infer_folds_from_text(*blobs: str | None) -> int | None:
    for blob in blobs:
        if not blob:
            continue
        m = _FOLDS_RE.search(blob)
        if not m:
            continue
        n = int(m.group(1))
        if 1 <= n <= 50:
            return n
    return None


def legs_from_text(*blobs: str | None) -> list[dict[str, Any]]:
    """Parse readable slip lines into serialisable leg dicts."""
    text_blob = "\n".join(b.strip() for b in blobs if b and b.strip())
    if not text_blob or len(text_blob) < 12:
        return []
    out: list[dict[str, Any]] = []
    for leg in parse_slip_text(text_blob):
        if not leg.market or not leg.selection:
            continue
        out.append(
            {
                "raw": leg.raw,
                "home_hint": leg.home_hint,
                "away_hint": leg.away_hint,
                "market": leg.market,
                "selection": leg.selection,
            }
        )
    return out


def has_rich_meta(
    *,
    folds: int | None,
    combined_odds: Decimal | float | None,
) -> bool:
    """Structured listing with both fold count and combined odds."""
    if folds is None or combined_odds is None:
        return False
    try:
        o = float(combined_odds)
    except (TypeError, ValueError):
        return False
    return folds >= 1 and o >= 1.01


def score_from_rich_meta(
    *,
    folds: int,
    combined_odds: Decimal | float,
) -> tuple[float, str]:
    """
    Honest heuristic when we have folds+odds but no legs.
    High multis / longshot odds stay low — never look like Safe tips.
    """
    o = float(combined_odds)
    # Geometric-ish “per-leg” odds proxy
    per = o ** (1.0 / max(folds, 1))
    # Map typical NG slip shapes into a bounded score
    if folds >= 10 or o >= 80:
        base = 28.0
    elif folds >= 7 or o >= 25:
        base = 38.0
    elif folds >= 5 or o >= 10:
        base = 48.0
    elif folds >= 4 or per >= 1.85:
        base = 56.0
    elif folds <= 2 and o <= 3.5:
        base = 72.0
    elif folds <= 3 and o <= 6:
        base = 64.0
    else:
        base = 52.0
    # Nudge by per-leg price (shorter → slightly higher)
    if per <= 1.35:
        base += 6
    elif per <= 1.55:
        base += 3
    elif per >= 2.4:
        base -= 6
    pct = round(min(78.0, max(22.0, base)), 1)
    return pct, "Odds/folds estimate (no legs)"


def _norm_tokens(name: str) -> set[str]:
    junk = {
        "fc", "sc", "cf", "afc", "cfc", "united", "utd", "city", "club",
        "de", "da", "do", "the",
    }
    s = re.sub(r"[^\w\s]", " ", (name or "").lower())
    return {t for t in s.split() if t and t not in junk and not t.isdigit()}


def _team_score(hint: str, actual: str) -> float:
    if not hint or not actual:
        return 0.0
    h, a = hint.lower().strip(), actual.lower().strip()
    if h == a:
        return 1.0
    if h in a or a in h:
        return 0.92
    th, ta = _norm_tokens(hint), _norm_tokens(actual)
    if not th or not ta:
        return 0.0
    inter = len(th & ta)
    if inter == 0:
        return 0.0
    return inter / min(len(th), len(ta))


def _match_score(leg: dict, match: Match) -> float:
    home, away = leg.get("home_hint"), leg.get("away_hint")
    if not home or not away:
        return 0.0
    direct = (_team_score(home, match.home_team) + _team_score(away, match.away_team)) / 2
    swapped = (_team_score(home, match.away_team) + _team_score(away, match.home_team)) / 2
    return max(direct, swapped)


def _fair_pct_from_prices(picked: Decimal, others: list[Decimal]) -> float | None:
    """De-vigged fair % for the picked price among market prices."""
    prices = [picked, *[p for p in others if p is not None]]
    inv = []
    for p in prices:
        f = float(p)
        if f <= 1:
            return None
        inv.append(1.0 / f)
    total = sum(inv)
    if total <= 0:
        return None
    return round(min(92.0, max(8.0, (inv[0] / total) * 100.0)), 1)


def _latest_market_prices(db: Session) -> dict[tuple[int, str, str], dict[str, Decimal]]:
    """(match_id, book, market) → {selection_lower: price}."""
    sql = text(
        """
        SELECT DISTINCT ON (o.match_id, o.bookmaker, o.market, o.selection)
            o.match_id,
            o.bookmaker,
            o.market,
            o.selection,
            o.price
        FROM odds o
        WHERE o.market IN ('1X2', 'double_chance', 'ou_2_5', 'btts')
        ORDER BY o.match_id, o.bookmaker, o.market, o.selection, o.captured_at DESC
        """
    )
    out: dict[tuple[int, str, str], dict[str, Decimal]] = {}
    for row in db.execute(sql).mappings().all():
        key = (
            int(row["match_id"]),
            str(row["bookmaker"]).lower(),
            str(row["market"]),
        )
        out.setdefault(key, {})[str(row["selection"]).lower()] = Decimal(str(row["price"]))
    return out


def build_confidence_context(db: Session, *, days_ahead: int = 21) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days_ahead)
    matches = list(
        db.scalars(
            select(Match)
            .where(Match.kickoff_at >= now, Match.kickoff_at < end)
            .order_by(Match.kickoff_at.asc())
        ).all()
    )
    return {
        "matches": matches,
        "prices": _latest_market_prices(db),
    }


def _leg_confidence(
    leg: dict,
    *,
    bookmaker: str,
    matches: list[Match],
    prices: dict[tuple[int, str, str], dict[str, Decimal]],
) -> dict[str, Any]:
    book = (bookmaker or "sportybet").strip().lower()
    market = (leg.get("market") or "").strip().lower()
    selection = (leg.get("selection") or "").strip().lower()
    row: dict[str, Any] = {
        **leg,
        "match_id": None,
        "status": "unmatched",
        "confidence_pct": None,
    }
    if not market or not selection:
        row["status"] = "unparsed"
        return row
    if not leg.get("home_hint") or not leg.get("away_hint"):
        return row

    best_m: Match | None = None
    best_s = 0.0
    for m in matches:
        sc = _match_score(leg, m)
        if sc > best_s:
            best_s = sc
            best_m = m
    if best_m is None or best_s < 0.45:
        return row

    market_key = "1X2" if market == "1x2" else market
    sel_map = prices.get((best_m.id, book, market_key)) or {}
    # Fall back to the other NG book if preferred has no price
    if not sel_map:
        other = "bet9ja" if book == "sportybet" else "sportybet"
        sel_map = prices.get((best_m.id, other, market_key)) or {}
        book = other if sel_map else book

    picked = sel_map.get(selection)
    if picked is None:
        row["match_id"] = best_m.id
        row["status"] = "no_odds"
        return row

    others = [p for sel, p in sel_map.items() if sel != selection]
    conf = _fair_pct_from_prices(picked, others)
    row["match_id"] = best_m.id
    row["home_team"] = best_m.home_team
    row["away_team"] = best_m.away_team
    row["status"] = "matched"
    row["confidence_pct"] = conf
    row["price"] = float(picked)
    return row


def score_from_legs(
    legs: list[dict[str, Any]],
    *,
    bookmaker: str,
    ctx: dict[str, Any],
) -> tuple[float | None, str, list[dict[str, Any]], int]:
    """
    Returns (pct|None, label, enriched_legs, matched_count).
    Needs ≥1 matched leg with a fair % to publish a score.
    """
    enriched = [
        _leg_confidence(
            leg,
            bookmaker=bookmaker,
            matches=ctx["matches"],
            prices=ctx["prices"],
        )
        for leg in legs
    ]
    matched = [e for e in enriched if e.get("status") == "matched" and e.get("confidence_pct") is not None]
    if not matched:
        # Legs exist but we couldn't price them — still not a fake score
        return None, "Legs found — unmatched to live odds", enriched, 0

    # Geometric mean of leg fair % → honest multi dampening
    logs = [math.log(max(1.0, float(e["confidence_pct"])) / 100.0) for e in matched]
    geo = math.exp(sum(logs) / len(logs)) * 100.0
    # Penalise when many legs remain unmatched
    coverage = len(matched) / max(len(legs), 1)
    if coverage < 0.5:
        geo *= 0.85
    pct = round(min(88.0, max(18.0, geo)), 1)
    label = f"Market match · {len(matched)}/{len(legs)} legs"
    return pct, label, enriched, len(matched)


def compute_scout_confidence(
    row: ScoutedCode,
    *,
    ctx: dict[str, Any] | None = None,
    db: Session | None = None,
    persist: bool = True,
) -> dict[str, Any]:
    """
    Compute verification + score for one scouted code.
    Mutates row fields when persist=True and db session is active.
    """
    legs: list[dict[str, Any]] = []
    if row.legs_json:
        try:
            raw = json.loads(row.legs_json)
            if isinstance(raw, list):
                legs = [x for x in raw if isinstance(x, dict)]
        except (TypeError, json.JSONDecodeError):
            legs = []

    if not legs:
        legs = legs_from_text(row.notes, row.title)
        if legs and persist:
            row.legs_json = json.dumps(legs)

    folds = row.folds
    if folds is None:
        folds = infer_folds_from_text(row.notes, row.title)
        if folds is not None and persist:
            row.folds = folds

    payload: dict[str, Any] = {
        "verification": VERIFICATION_UNVERIFIED,
        "confidence_pct": None,
        "confidence_label": UNVERIFIED_LABEL,
        "legs_count": len(legs),
        "legs_matched": 0,
        "enriched_legs": [],
        "safety_edits": [],
        "safety_summary": None,
    }

    enriched_for_edit: list[dict[str, Any]] = []

    if legs:
        if ctx is None and db is not None:
            ctx = build_confidence_context(db)
        if ctx is not None:
            pct, label, enriched, matched = score_from_legs(
                legs, bookmaker=row.bookmaker, ctx=ctx
            )
            payload["legs_matched"] = matched
            enriched_for_edit = enriched
            payload["enriched_legs"] = enriched
            if pct is not None:
                payload.update(
                    {
                        "verification": VERIFICATION_LEGS,
                        "confidence_pct": pct,
                        "confidence_label": label,
                    }
                )
            else:
                # Legs present but unscored — still not "verified %"
                # Fall through to rich meta if available, else unmatched message
                if has_rich_meta(folds=folds, combined_odds=row.combined_odds):
                    rp, rl = score_from_rich_meta(
                        folds=int(folds), combined_odds=row.combined_odds  # type: ignore[arg-type]
                    )
                    payload.update(
                        {
                            "verification": VERIFICATION_RICH,
                            "confidence_pct": rp,
                            "confidence_label": rl,
                        }
                    )
                else:
                    payload["confidence_label"] = label
                    payload["verification"] = VERIFICATION_UNVERIFIED
            if persist and enriched:
                row.legs_json = json.dumps(
                    [
                        {
                            "raw": e.get("raw"),
                            "home_hint": e.get("home_hint"),
                            "away_hint": e.get("away_hint"),
                            "market": e.get("market"),
                            "selection": e.get("selection"),
                        }
                        for e in enriched
                    ]
                )
        elif has_rich_meta(folds=folds, combined_odds=row.combined_odds):
            rp, rl = score_from_rich_meta(
                folds=int(folds), combined_odds=row.combined_odds  # type: ignore[arg-type]
            )
            payload.update(
                {
                    "verification": VERIFICATION_RICH,
                    "confidence_pct": rp,
                    "confidence_label": rl,
                }
            )
    elif has_rich_meta(folds=folds, combined_odds=row.combined_odds):
        rp, rl = score_from_rich_meta(
            folds=int(folds), combined_odds=row.combined_odds  # type: ignore[arg-type]
        )
        payload.update(
            {
                "verification": VERIFICATION_RICH,
                "confidence_pct": rp,
                "confidence_label": rl,
            }
        )

    edits, summary = build_safety_edits(
        enriched_legs=enriched_for_edit,
        folds=folds if folds is not None else row.folds,
        combined_odds=row.combined_odds,
        risk_band=row.risk_band,
        confidence_pct=payload.get("confidence_pct"),
        verification=payload.get("verification"),
    )
    payload["safety_edits"] = edits
    payload["safety_summary"] = summary

    if persist:
        row.verification = payload["verification"]
        row.confidence_pct = (
            Decimal(str(payload["confidence_pct"]))
            if payload["confidence_pct"] is not None
            else None
        )
        row.confidence_label = payload["confidence_label"]

    return payload


def enrich_scouted_codes(
    db: Session,
    rows: list[ScoutedCode],
    *,
    persist: bool = True,
) -> list[dict[str, Any]]:
    """Score rows in batch; returns confidence payloads aligned with `rows`."""
    if not rows:
        return []
    ctx = build_confidence_context(db)
    payloads: list[dict[str, Any]] = []
    for row in rows:
        payloads.append(compute_scout_confidence(row, ctx=ctx, db=db, persist=persist))
    if persist:
        db.commit()
    return payloads
