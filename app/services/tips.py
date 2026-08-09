"""
Tip logging + hit-rate stats (Phase 4 + 10D multi slips).
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Match, Tip
from app.services.tip_settle import selection_won


def tip_to_dict(tip: Tip) -> dict:
    m = tip.match
    return {
        "id": tip.id,
        "match_id": tip.match_id,
        "home_team": m.home_team if m else "?",
        "away_team": m.away_team if m else "?",
        "competition_code": m.competition_code if m else "?",
        "kickoff_at": m.kickoff_at if m else None,
        "match_status": m.status if m else None,
        "home_score": m.home_score if m else None,
        "away_score": m.away_score if m else None,
        "risk_profile": tip.risk_profile,
        "market": tip.market,
        "selection": tip.selection,
        "odds_price": tip.odds_price,
        "bookmaker": tip.bookmaker,
        "stake_ngn": tip.stake_ngn,
        "pick_market": tip.pick_market,
        "dog_odds": tip.dog_odds,
        "fav_odds": tip.fav_odds,
        "source": tip.source,
        "slip_id": tip.slip_id,
        "rationale": tip.rationale,
        "result": tip.result,
        "created_at": tip.created_at,
        "settled_at": tip.settled_at,
    }


def _norm_sel(selection: str) -> str:
    return str(selection or "").strip().lower()


def _norm_book(bookmaker: str | None) -> str:
    return str(bookmaker or "").strip().lower() or "unknown"


def _tip_key(tip: Tip) -> tuple:
    """Same placeable pick = same match + book + market + selection (any source)."""
    return (
        tip.match_id,
        _norm_book(tip.bookmaker),
        str(tip.market or "").strip().lower(),
        _norm_sel(tip.selection),
    )


def find_existing_tip(
    db: Session,
    *,
    match_id: int,
    market: str,
    selection: str,
    source: str | None = None,
    bookmaker: str | None = None,
) -> Tip | None:
    """
    Any non-void tip for the same placeable pick blocks a new log.
    Source is ignored so Today log + match-page log don't double-create.
    """
    q = (
        select(Tip)
        .options(joinedload(Tip.match))
        .where(
            Tip.match_id == match_id,
            Tip.market == market,
            Tip.result != "void",
        )
        .order_by(Tip.id.asc())
    )
    rows = list(db.scalars(q).unique().all())
    want_sel = _norm_sel(selection)
    want_book = _norm_book(bookmaker) if bookmaker else None
    for tip in rows:
        if _norm_sel(tip.selection) != want_sel:
            continue
        if want_book and _norm_book(tip.bookmaker) != want_book:
            continue
        return tip
    return None


def _void_tip(tip: Tip, reason: str = "auto-voided duplicate") -> None:
    tip.result = "void"
    tip.settled_at = datetime.now(timezone.utc)
    tip.rationale = ((tip.rationale or "") + f" | {reason}").strip(" |")


def cleanup_duplicate_tips(db: Session) -> int:
    """
    Void extras so Load tips is readable:

    1) Same match+book+market+selection (any source) → keep one
    2) Same match Safe Builder singles → only ONE active tip
       (skip multi-slip legs — DC+O/U+BTTS must stay)
    """
    tips = db.scalars(
        select(Tip).where(Tip.result != "void").order_by(Tip.id.asc())
    ).all()
    best: dict[tuple, Tip] = {}
    to_void: list[Tip] = []

    for tip in tips:
        key = _tip_key(tip)
        if key not in best:
            best[key] = tip
            continue
        kept = best[key]
        kept_settled = kept.result in ("won", "lost")
        tip_settled = tip.result in ("won", "lost")
        if tip_settled and not kept_settled:
            to_void.append(kept)
            best[key] = tip
        elif tip_settled == kept_settled:
            if tip.id < kept.id:
                to_void.append(kept)
                best[key] = tip
            else:
                to_void.append(tip)
        else:
            to_void.append(tip)

    # Pass 2: one Safe Builder tip per match (void superseded styles)
    by_match: dict[tuple, list[Tip]] = {}
    survivors = [t for t in tips if t not in to_void]
    for tip in survivors:
        if tip.source != "safe_builder":
            continue
        if tip.slip_id:
            continue
        mk = (tip.match_id, tip.source)
        by_match.setdefault(mk, []).append(tip)

    for group in by_match.values():
        if len(group) <= 1:
            continue
        settled = [t for t in group if t.result in ("won", "lost")]
        pending = [t for t in group if t.result == "pending"]
        if settled:
            # Keep settled history for learning; drop pending re-logs of same match
            for t in pending:
                to_void.append(t)
            # If multiple settled (1X2 won + later mistake), keep newest settled only for display?
            # Keep ALL settled for learning stats — only void pending.
            continue
        # All pending: prefer double_chance, else newest id
        def pending_rank(t: Tip) -> tuple:
            dc = 1 if t.market == "double_chance" else 0
            return (dc, t.id)

        keep = max(pending, key=pending_rank)
        for t in pending:
            if t.id != keep.id:
                to_void.append(t)

    # Unique to_void
    seen_ids: set[int] = set()
    unique_void: list[Tip] = []
    for tip in to_void:
        if tip.id in seen_ids:
            continue
        seen_ids.add(tip.id)
        unique_void.append(tip)

    for tip in unique_void:
        _void_tip(tip, "auto-voided duplicate / superseded style")

    if unique_void:
        db.commit()
    return len(unique_void)


def create_tip(
    db: Session,
    *,
    match_id: int,
    risk_profile: str,
    market: str,
    selection: str,
    odds_price: Decimal | None = None,
    bookmaker: str | None = None,
    stake_ngn: Decimal | None = None,
    pick_market: str | None = None,
    dog_odds: Decimal | None = None,
    fav_odds: Decimal | None = None,
    source: str = "manual",
    slip_id: str | None = None,
    rationale: str | None = None,
    skip_duplicate: bool = True,
) -> tuple[Tip | None, str]:
    """
    Insert a tip. Returns (tip, status) where status is created|duplicate|error.
    """
    match = db.get(Match, match_id)
    if match is None:
        return None, "error: match not found"

    if skip_duplicate:
        dup = find_existing_tip(
            db,
            match_id=match_id,
            market=market,
            selection=selection,
            bookmaker=bookmaker,
        )
        if dup is not None:
            return dup, "duplicate"

    if pick_market is None:
        pick_market = "double_chance" if market == "double_chance" else "1x2"

    tip = Tip(
        match_id=match_id,
        risk_profile=risk_profile,
        market=market,
        selection=selection,
        odds_price=odds_price,
        bookmaker=bookmaker,
        stake_ngn=stake_ngn,
        pick_market=pick_market,
        dog_odds=dog_odds,
        fav_odds=fav_odds,
        source=source,
        slip_id=slip_id,
        rationale=rationale,
        result="pending",
    )
    db.add(tip)
    db.commit()
    db.refresh(tip)
    tip = db.scalars(
        select(Tip).options(joinedload(Tip.match)).where(Tip.id == tip.id)
    ).one()
    return tip, "created"


def log_selected_tips(
    db: Session,
    tips: list[dict],
    *,
    as_multi: bool = True,
) -> dict:
    """
    Persist checkbox-selected tips. When as_multi and 2+ tips share a bookmaker,
    assign one slip_id (accumulator) and put stake only on the first leg.
    """
    created: list[dict] = []
    skipped: list[dict] = []
    errors: list[str] = []
    if not tips:
        return {
            "created_count": 0,
            "skipped_duplicates": 0,
            "errors": [],
            "created": [],
            "skipped": [],
            "message": "No tips selected.",
            "slip_count": 0,
        }

    slip_for_index: dict[int, str] = {}
    if as_multi:
        by_book: dict[str, list[int]] = {}
        for i, t in enumerate(tips):
            book = _norm_book(t.get("bookmaker"))
            by_book.setdefault(book, []).append(i)
        for idxs in by_book.values():
            if len(idxs) < 2:
                continue
            sid = str(uuid4())
            for i in idxs:
                slip_for_index[i] = sid

    first_of_slip: dict[str, int] = {}
    for i, sid in slip_for_index.items():
        if sid not in first_of_slip or i < first_of_slip[sid]:
            first_of_slip[sid] = i

    for i, t in enumerate(tips):
        mid = t.get("match_id")
        if mid is None:
            errors.append("tip missing match_id")
            continue
        slip_id = slip_for_index.get(i)
        stake = t.get("stake_ngn")
        if stake is not None:
            try:
                if Decimal(str(stake)) <= 0:
                    stake = None
            except Exception:
                stake = None
        if slip_id is not None and first_of_slip.get(slip_id) != i:
            stake = None

        tip, status = create_tip(
            db,
            match_id=int(mid),
            risk_profile=str(t.get("risk_profile") or t.get("profile") or "manual"),
            market=str(t["market"]),
            selection=str(t["selection"]),
            odds_price=t.get("odds_price", t.get("odds")),
            bookmaker=t.get("bookmaker"),
            stake_ngn=stake,
            pick_market=t.get("pick_market"),
            dog_odds=t.get("dog_odds"),
            fav_odds=t.get("fav_odds"),
            source=str(t.get("source") or "manual"),
            slip_id=slip_id,
            rationale=t.get("rationale"),
            skip_duplicate=True,
        )
        if status == "created" and tip is not None:
            created.append(tip_to_dict(tip))
        elif status == "duplicate" and tip is not None:
            skipped.append(
                {
                    "tip_id": tip.id,
                    "match_id": mid,
                    "selection": t.get("selection"),
                    "bookmaker": t.get("bookmaker"),
                }
            )
        else:
            errors.append(status)

    slip_count = len({c.get("slip_id") for c in created if c.get("slip_id")})
    multi_note = (
        f" ({slip_count} multi slip(s))" if slip_count else ""
    )
    return {
        "created_count": len(created),
        "skipped_duplicates": len(skipped),
        "errors": errors,
        "created": created,
        "skipped": skipped,
        "slip_count": slip_count,
        "message": (
            f"Logged {len(created)} selected tip(s){multi_note}; "
            f"skipped {len(skipped)} duplicate(s)."
        ),
    }


def log_safe_picks(db: Session, picks: list[dict], *, source: str = "safe_builder") -> dict:
    """Persist Safe Builder scan picks; skip duplicates (pending or settled)."""
    cleanup_duplicate_tips(db)
    created: list[dict] = []
    skipped: list[dict] = []
    errors: list[str] = []

    for p in picks:
        mid = p.get("match_id")
        if not mid:
            errors.append("pick missing match_id")
            continue
        tip, status = create_tip(
            db,
            match_id=int(mid),
            risk_profile=str(p.get("profile") or "safe"),
            market=str(p["market"]),
            selection=str(p["selection"]),
            odds_price=p.get("odds"),
            bookmaker=p.get("bookmaker"),
            stake_ngn=p.get("suggested_stake_ngn"),
            pick_market=p.get("pick_market"),
            dog_odds=p.get("dog_odds"),
            fav_odds=p.get("fav_odds"),
            source=source,
            rationale=p.get("rationale"),
            skip_duplicate=True,
        )
        if status == "created" and tip is not None:
            created.append(tip_to_dict(tip))
        elif status == "duplicate" and tip is not None:
            skipped.append({"tip_id": tip.id, "match_id": mid, "selection": p.get("selection")})
        else:
            errors.append(status)

    return {
        "created_count": len(created),
        "skipped_duplicates": len(skipped),
        "errors": errors,
        "created": created,
        "skipped": skipped,
        "message": (
            f"Logged {len(created)} new tip(s); "
            f"skipped {len(skipped)} duplicate tip(s)."
        ),
    }


def list_tips(
    db: Session,
    *,
    result: str | None = None,
    source: str | None = None,
    limit: int = 50,
    hide_void: bool = False,
) -> list[dict]:
    # Clean existing duplicates so Load tips doesn't show Beijing twice
    cleanup_duplicate_tips(db)

    q = select(Tip).options(joinedload(Tip.match)).order_by(Tip.created_at.desc())
    if result:
        q = q.where(Tip.result == result)
    elif hide_void:
        q = q.where(Tip.result != "void")
    if source:
        q = q.where(Tip.source == source)
    q = q.limit(limit * 3)  # fetch extra before dedupe
    rows = [tip_to_dict(t) for t in db.scalars(q).unique().all()]

    # Display: keep all multi legs; collapse Safe Builder singles per match
    def keep_score(t: dict) -> tuple:
        result = t.get("result") or ""
        pri = {"won": 4, "lost": 4, "pending": 2, "void": 0}.get(result, 1)
        dc = 1 if t.get("market") == "double_chance" else 0
        tip_id = t.get("id") or 0
        return (pri, dc, tip_id)

    best: dict[tuple, dict] = {}
    for t in rows:
        if t.get("slip_id"):
            key: tuple = ("slip", t["slip_id"], t["id"])
        elif t.get("source") == "safe_builder":
            key = (t["match_id"], t["source"])
        else:
            key = (
                t["match_id"],
                _norm_book(t.get("bookmaker")),
                str(t.get("market") or "").lower(),
                _norm_sel(str(t.get("selection") or "")),
            )
        if key not in best or keep_score(t) > keep_score(best[key]):
            best[key] = t

    unique = sorted(best.values(), key=lambda t: t.get("created_at") or "", reverse=True)
    return unique[:limit]


def settle_tip(
    db: Session,
    tip_id: int,
    result: str,
) -> Tip:
    if result not in ("won", "lost", "void", "pending"):
        raise ValueError("result must be won|lost|void|pending")
    tip = db.get(Tip, tip_id)
    if tip is None:
        raise LookupError(f"tip {tip_id} not found")
    tip.result = result
    tip.settled_at = (
        None if result == "pending" else datetime.now(timezone.utc)
    )

    # Void sibling duplicates so they don't linger as a second "pending" row
    if result in ("won", "lost", "void"):
        siblings = db.scalars(
            select(Tip).where(
                Tip.id != tip.id,
                Tip.match_id == tip.match_id,
                Tip.market == tip.market,
                Tip.result == "pending",
            )
        ).all()
        now = datetime.now(timezone.utc)
        want_sel = _norm_sel(tip.selection)
        want_book = _norm_book(tip.bookmaker)
        for sib in siblings:
            if _norm_sel(sib.selection) != want_sel:
                continue
            if _norm_book(sib.bookmaker) != want_book:
                continue
            sib.result = "void"
            sib.settled_at = now
            sib.rationale = ((sib.rationale or "") + " | auto-voided duplicate").strip(" |")

        # Multi: settle all legs together when user marks one leg
        if tip.slip_id and result in ("won", "lost", "void"):
            legs = db.scalars(
                select(Tip).where(
                    Tip.slip_id == tip.slip_id,
                    Tip.id != tip.id,
                    Tip.result == "pending",
                )
            ).all()
            for leg in legs:
                leg.result = result
                leg.settled_at = tip.settled_at

    db.commit()
    db.refresh(tip)
    return db.scalars(
        select(Tip).options(joinedload(Tip.match)).where(Tip.id == tip.id)
    ).one()


def auto_settle_finished(db: Session) -> dict:
    """
    Settle pending tips whose match is FINISHED with scores.

    Multi slips (shared slip_id): wait until every leg can be judged, then
    won only if all legs won (accumulator rules).
    """
    tips = db.scalars(
        select(Tip)
        .options(joinedload(Tip.match))
        .where(Tip.result == "pending")
    ).unique().all()

    settled: list[dict] = []
    unresolved: list[dict] = []
    now = datetime.now(timezone.utc)

    singles = [t for t in tips if not t.slip_id]
    by_slip: dict[str, list[Tip]] = {}
    for t in tips:
        if t.slip_id:
            by_slip.setdefault(t.slip_id, []).append(t)

    for tip in singles:
        m = tip.match
        if m is None:
            continue
        status = (m.status or "").upper()
        if status != "FINISHED" or m.home_score is None or m.away_score is None:
            unresolved.append({"tip_id": tip.id, "reason": "match not finished"})
            continue
        won = selection_won(tip.market, tip.selection, m.home_score, m.away_score)
        if won is None:
            unresolved.append(
                {"tip_id": tip.id, "reason": f"cannot judge {tip.market}/{tip.selection}"}
            )
            continue
        tip.result = "won" if won else "lost"
        tip.settled_at = now
        settled.append(tip_to_dict(tip))

    for slip_id, legs in by_slip.items():
        judgements: list[bool] = []
        blocked = False
        for tip in legs:
            m = tip.match
            if m is None:
                unresolved.append({"tip_id": tip.id, "slip_id": slip_id, "reason": "no match"})
                blocked = True
                break
            status = (m.status or "").upper()
            if status != "FINISHED" or m.home_score is None or m.away_score is None:
                unresolved.append(
                    {
                        "tip_id": tip.id,
                        "slip_id": slip_id,
                        "reason": "multi waiting — match not finished",
                    }
                )
                blocked = True
                break
            won = selection_won(tip.market, tip.selection, m.home_score, m.away_score)
            if won is None:
                unresolved.append(
                    {
                        "tip_id": tip.id,
                        "slip_id": slip_id,
                        "reason": f"cannot judge {tip.market}/{tip.selection}",
                    }
                )
                blocked = True
                break
            judgements.append(won)
        if blocked:
            continue
        overall = all(judgements)
        for tip in legs:
            tip.result = "won" if overall else "lost"
            tip.settled_at = now
            settled.append(tip_to_dict(tip))

    db.commit()
    return {
        "settled_count": len(settled),
        "unresolved_count": len(unresolved),
        "settled": settled,
        "unresolved": unresolved[:20],
        "message": f"Auto-settled {len(settled)} tip(s) from finished matches.",
    }


def tip_stats(db: Session) -> dict:
    # Ignore auto-voided duplicates in the headline numbers
    rows = db.execute(
        select(Tip.result, Tip.risk_profile, func.count())
        .where(Tip.result != "void")
        .group_by(Tip.result, Tip.risk_profile)
    ).all()

    by_result: dict[str, int] = {}
    by_profile: dict[str, dict[str, int]] = {}
    for result, profile, count in rows:
        by_result[result] = by_result.get(result, 0) + int(count)
        by_profile.setdefault(profile, {})
        by_profile[profile][result] = int(count)

    settled = by_result.get("won", 0) + by_result.get("lost", 0)
    won = by_result.get("won", 0)
    hit_rate_pct = round((won / settled) * 100, 1) if settled else None

    profile_rates = []
    for profile, counts in sorted(by_profile.items()):
        s = counts.get("won", 0) + counts.get("lost", 0)
        profile_rates.append(
            {
                "risk_profile": profile,
                "won": counts.get("won", 0),
                "lost": counts.get("lost", 0),
                "pending": counts.get("pending", 0),
                "void": counts.get("void", 0),
                "settled": s,
                "hit_rate_pct": round((counts.get("won", 0) / s) * 100, 1) if s else None,
            }
        )

    return {
        "total": sum(by_result.values()),
        "pending": by_result.get("pending", 0),
        "won": won,
        "lost": by_result.get("lost", 0),
        "void": by_result.get("void", 0),
        "settled": settled,
        "hit_rate_pct": hit_rate_pct,
        "by_profile": profile_rates,
        "message": (
            f"Hit rate {hit_rate_pct}% ({won}/{settled} settled)"
            if settled
            else "No settled tips yet — log picks and settle after matches finish."
        ),
    }
