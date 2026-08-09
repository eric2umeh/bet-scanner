"""
Phase 10E — assisted slip converter / cross-book price-check.

Honest scope: we do NOT decode opaque SportyBet/Bet9ja booking codes.
User pastes a readable slip → we match fixtures + compare stored NG odds.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import Match
from app.services.code_parse import ParsedLeg, normalize_code, parse_slip_text

_BOOKS = ("sportybet", "bet9ja")
_JUNK_TOKENS = {
    "fc",
    "sc",
    "cf",
    "afc",
    "cfc",
    "united",
    "utd",
    "city",
    "club",
    "de",
    "da",
    "do",
    "the",
    "rj",
    "ba",
    "sp",
    "mg",
    "ec",
    "cr",
    "ac",
    "as",
}


def _norm_tokens(name: str) -> set[str]:
    s = re.sub(r"[^\w\s]", " ", (name or "").lower())
    toks = [t for t in s.split() if t and t not in _JUNK_TOKENS and not t.isdigit()]
    return set(toks)


def _team_score(hint: str, actual: str) -> float:
    if not hint or not actual:
        return 0.0
    h = hint.lower().strip()
    a = actual.lower().strip()
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
    # Favour subset matches (Flamengo ⊂ CR Flamengo RJ)
    return inter / min(len(th), len(ta))


def _match_score(leg: ParsedLeg, match: Match) -> float:
    if not leg.home_hint or not leg.away_hint:
        return 0.0
    direct = (
        _team_score(leg.home_hint, match.home_team)
        + _team_score(leg.away_hint, match.away_team)
    ) / 2
    swapped = (
        _team_score(leg.home_hint, match.away_team)
        + _team_score(leg.away_hint, match.home_team)
    ) / 2
    return max(direct, swapped)


def _latest_odds_map(db: Session) -> dict[tuple[int, str, str, str], Decimal]:
    """(match_id, book, market, selection_lower) → latest price."""
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
    out: dict[tuple[int, str, str, str], Decimal] = {}
    for row in db.execute(sql).mappings().all():
        key = (
            int(row["match_id"]),
            str(row["bookmaker"]).lower(),
            str(row["market"]),
            str(row["selection"]).lower(),
        )
        out[key] = Decimal(str(row["price"]))
    return out


def _sel_key(market: str, selection: str) -> str:
    s = selection.lower().strip()
    if market == "double_chance":
        return s  # 1x, x2, 12
    return s


def _product(prices: list[Decimal]) -> Decimal | None:
    if not prices:
        return None
    total = Decimal("1")
    for p in prices:
        total *= p
    return total.quantize(Decimal("0.001"))


def convert_slip(
    db: Session,
    *,
    slip_text: str,
    code_text: str | None = None,
    source_book: str | None = "sportybet",
    days_ahead: int = 21,
) -> dict:
    parsed = parse_slip_text(slip_text)
    code = normalize_code(code_text) if code_text else None
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days_ahead)

    matches = list(
        db.scalars(
            select(Match)
            .where(Match.kickoff_at >= now, Match.kickoff_at < end)
            .order_by(Match.kickoff_at.asc())
        ).all()
    )
    odds_map = _latest_odds_map(db)

    legs_out: list[dict] = []
    for leg in parsed:
        row: dict = {
            "raw": leg.raw,
            "market": leg.market,
            "selection": leg.selection,
            "match_id": None,
            "home_team": None,
            "away_team": None,
            "competition_code": None,
            "kickoff_at": None,
            "match_score": None,
            "prices": {b: None for b in _BOOKS},
            "best_book": None,
            "best_price": None,
            "status": "unparsed",
        }
        if not leg.market or not leg.selection:
            legs_out.append(row)
            continue
        if not leg.home_hint or not leg.away_hint:
            row["status"] = "unmatched_match"
            legs_out.append(row)
            continue

        best_m: Match | None = None
        best_s = 0.0
        for m in matches:
            sc = _match_score(leg, m)
            if sc > best_s:
                best_s = sc
                best_m = m
        if best_m is None or best_s < 0.45:
            row["status"] = "unmatched_match"
            legs_out.append(row)
            continue

        row["match_id"] = best_m.id
        row["home_team"] = best_m.home_team
        row["away_team"] = best_m.away_team
        row["competition_code"] = best_m.competition_code
        row["kickoff_at"] = (
            best_m.kickoff_at.isoformat() if best_m.kickoff_at else None
        )
        row["match_score"] = round(best_s, 3)

        sel = _sel_key(leg.market, leg.selection)
        # DB stores match-result market as "1X2"; DC selections as 1X/X2/12
        market_key = "1X2" if leg.market == "1x2" else leg.market
        prices: dict[str, Decimal | None] = {}
        for book in _BOOKS:
            prices[book] = odds_map.get((best_m.id, book, market_key, sel))
        row["prices"] = prices

        best_book = None
        best_price = None
        for book, price in prices.items():
            if price is None:
                continue
            if best_price is None or price > best_price:
                best_price = price
                best_book = book
        row["best_book"] = best_book
        row["best_price"] = best_price
        row["status"] = "matched" if best_price is not None else "no_odds"
        legs_out.append(row)

    if not parsed:
        return {
            "legs": [],
            "matched_count": 0,
            "combined_sportybet": None,
            "combined_bet9ja": None,
            "combined_best_mixed": None,
            "place_summary": "",
            "code_text": code,
            "message": (
                "Could not parse any legs. Paste lines like "
                "'Flamengo vs Vitoria' then 'Double chance 1X' / 'Over 2.5' / 'BTTS No'."
            ),
        }

    def combined_for(book: str) -> Decimal | None:
        prices = []
        for leg in legs_out:
            if leg["status"] not in ("matched", "no_odds"):
                return None
            p = leg["prices"].get(book)
            if p is None:
                return None
            prices.append(p)
        return _product(prices)

    mixed: list[Decimal] = []
    for leg in legs_out:
        if leg["best_price"] is None:
            mixed = []
            break
        mixed.append(leg["best_price"])
    combined_mixed = _product(mixed) if mixed else None

    matched = sum(1 for leg in legs_out if leg["status"] == "matched")
    summary_lines = [
        "Slip price-check (verify live — not a booking-code decode)",
    ]
    if code:
        summary_lines.append(f"Code note: {code}")
    if source_book:
        summary_lines.append(f"Source book: {source_book}")
    for i, leg in enumerate(legs_out, 1):
        mkt = f"{leg['market']}/{leg['selection']}" if leg["market"] else "?"
        if leg["home_team"]:
            fixture = f"{leg['home_team']} vs {leg['away_team']}"
        else:
            fixture = leg["raw"]
        sp = leg["prices"].get("sportybet")
        b9 = leg["prices"].get("bet9ja")
        best = (
            f"best {leg['best_book']}@{leg['best_price']}"
            if leg["best_book"]
            else leg["status"]
        )
        summary_lines.append(
            f"{i}) {fixture} — {mkt} · SB {sp or '—'} / B9 {b9 or '—'} · {best}"
        )
    cs = combined_for("sportybet")
    cb = combined_for("bet9ja")
    if cs is not None:
        summary_lines.append(f"Combined SportyBet ~ {cs}")
    if cb is not None:
        summary_lines.append(f"Combined Bet9ja ~ {cb}")
    if combined_mixed is not None:
        summary_lines.append(f"Best-price mix ~ {combined_mixed} (not one book)")

    return {
        "legs": legs_out,
        "matched_count": matched,
        "combined_sportybet": cs,
        "combined_bet9ja": cb,
        "combined_best_mixed": combined_mixed,
        "place_summary": "\n".join(summary_lines),
        "code_text": code,
        "message": (
            f"Parsed {len(legs_out)} leg(s); {matched} with prices on SportyBet/Bet9ja. "
            "Codes stay opaque — paste the slip text, not only the code."
        ),
    }
