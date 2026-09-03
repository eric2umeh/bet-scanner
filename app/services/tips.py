"""
Tip logging + hit-rate stats (Phase 4 + 10D multi slips).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.config import Settings, get_settings
from app.models import Match, Tip
from app.services.match_score_backfill import refresh_scores_for_matches
from app.services.ng_market_filters import is_youth_or_reserve_match
from app.services.match_status import is_voidable_match_status, normalize_match_status, void_reason_label
from app.services.tip_settle import selection_won


def _confidence_display(tip: Tip) -> float | None:
    """Stored lean %, or recompute from fav/dog odds when older rows lack the column."""
    if tip.confidence_pct is not None:
        return round(float(tip.confidence_pct), 1)
    fav, dog = tip.fav_odds, tip.dog_odds
    if fav is not None and dog is not None:
        try:
            fa = Decimal(str(fav))
            db = Decimal(str(dog))
            if fa > 1 and db > 1:
                from app.services.scan_goal_markets import _confidence

                return _confidence(fa, db)
        except Exception:
            pass
    return None


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
        "owner_id": tip.owner_id,
        "rationale": tip.rationale,
        "confidence_pct": _confidence_display(tip),
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
    owner_id: str | None = None,
) -> Tip | None:
    """
    Any non-void tip for the same placeable pick blocks a new log.
    Source is ignored so Today log + match-page log don't double-create.
    When owner_id is set, only that user's tips count as duplicates.
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
    if owner_id:
        q = q.where(Tip.owner_id == owner_id)
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
    confidence_pct: float | None = None,
    owner_id: str | None = None,
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
            owner_id=owner_id,
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
        owner_id=owner_id,
        rationale=rationale,
        confidence_pct=confidence_pct,
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
    owner_id: str | None = None,
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

        market = str(t.get("market") or "").lower()
        if market in ("ou_0_5", "ou_1_5", "ou_2_5", "btts", "tt_2_5"):
            match_row = db.get(Match, int(mid))
            if match_row and is_youth_or_reserve_match(
                match_row.home_team,
                match_row.away_team,
                competition_code=match_row.competition_code,
                competition_name=match_row.competition_name,
            ):
                errors.append(
                    f"Skipped youth/reserve goal market: "
                    f"{match_row.home_team} vs {match_row.away_team}"
                )
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
            confidence_pct=t.get("confidence_pct"),
            owner_id=owner_id,
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


def _market_filter_clause(market: str | None):
    """Map UI chip → SQL market filter."""
    if not market or market == "all":
        return None
    key = market.strip().lower()
    if key in {"dc", "double_chance"}:
        return Tip.market == "double_chance"
    if key in {"1x2", "winner", "ml"}:
        return Tip.market.in_(("1X2", "1x2"))
    if key in {"ou_0_5", "ou_1_5", "ou_2_5", "btts", "tt_2_5"}:
        return Tip.market == key
    if key == "ou":
        return Tip.market.in_(("ou_0_5", "ou_1_5", "ou_2_5"))
    return Tip.market == key


def _apply_tip_list_filters(
    stmt,
    *,
    result: str | None,
    source: str | None,
    market: str | None,
    owner_id: str | None,
    date_from: date | None,
    date_to: date | None,
    needle: str,
    hide_void: bool,
):
    if result == "settled":
        stmt = stmt.where(Tip.result.in_(("won", "lost", "void")))
    elif result:
        stmt = stmt.where(Tip.result == result)
    elif hide_void:
        stmt = stmt.where(Tip.result != "void")
    if source:
        stmt = stmt.where(Tip.source == source)
    mclause = _market_filter_clause(market)
    if mclause is not None:
        stmt = stmt.where(mclause)
    if owner_id:
        stmt = stmt.where(Tip.owner_id == owner_id)
    if date_from is not None:
        start = datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc)
        stmt = stmt.where(Tip.created_at >= start)
    if date_to is not None:
        end = datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc)
        stmt = stmt.where(Tip.created_at <= end)
    if needle:
        like = f"%{needle}%"
        stmt = stmt.where(
            or_(
                Match.home_team.ilike(like),
                Match.away_team.ilike(like),
                Tip.market.ilike(like),
                Tip.selection.ilike(like),
                Tip.bookmaker.ilike(like),
            )
        )
    return stmt


def list_tips(
    db: Session,
    *,
    result: str | None = None,
    source: str | None = None,
    market: str | None = None,
    limit: int = 10,
    offset: int = 0,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    hide_void: bool = False,
    owner_id: str | None = None,
) -> dict:
    """
    Paginated tip list — one SQL page + count (efficient pagination UI).
    Returns { items, has_more, total, limit, offset }.
    """
    page_size = max(1, min(int(limit), 50))
    off = max(0, int(offset))
    needle = (q or "").strip()

    base = select(Tip).join(Match, Tip.match_id == Match.id)
    base = _apply_tip_list_filters(
        base,
        result=result,
        source=source,
        market=market,
        owner_id=owner_id,
        date_from=date_from,
        date_to=date_to,
        needle=needle,
        hide_void=hide_void,
    )

    count_stmt = select(func.count()).select_from(base.subquery())
    total = int(db.scalar(count_stmt) or 0)

    stmt = (
        base.options(joinedload(Tip.match))
        .order_by(Tip.created_at.desc(), Tip.id.desc())
        .offset(off)
        .limit(page_size)
    )
    items = [tip_to_dict(t) for t in db.scalars(stmt).unique().all()]
    return {
        "items": items,
        "has_more": off + len(items) < total,
        "total": total,
        "limit": page_size,
        "offset": off,
    }


def delete_tip(
    db: Session,
    tip_id: int,
    *,
    owner_id: str | None = None,
) -> None:
    tip = db.get(Tip, tip_id)
    if tip is None:
        raise LookupError(f"Tip {tip_id} not found")
    if owner_id and tip.owner_id and tip.owner_id != owner_id:
        raise PermissionError("Not allowed to delete this tip")
    db.delete(tip)
    db.commit()


def settle_tip(
    db: Session,
    tip_id: int,
    result: str,
    *,
    apply_to_slip: bool = False,
    owner_id: str | None = None,
) -> Tip:
    if result not in ("won", "lost", "void", "pending"):
        raise ValueError("result must be won|lost|void|pending")
    tip = db.get(Tip, tip_id)
    if tip is None:
        raise LookupError(f"tip {tip_id} not found")
    if tip.owner_id and owner_id and tip.owner_id != owner_id:
        raise PermissionError("This tip belongs to another account.")
    if tip.owner_id and owner_id is None:
        raise PermissionError("Sign in to settle this tip.")
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

        # Optional: settle entire multi slip with the same result
        if apply_to_slip and tip.slip_id and result in ("won", "lost", "void", "pending"):
            legs = db.scalars(
                select(Tip).where(
                    Tip.slip_id == tip.slip_id,
                    Tip.id != tip.id,
                )
            ).all()
            for leg in legs:
                if result == "pending":
                    leg.result = "pending"
                    leg.settled_at = None
                elif leg.result == "pending" or apply_to_slip:
                    leg.result = result
                    leg.settled_at = tip.settled_at

    db.commit()
    db.refresh(tip)
    return db.scalars(
        select(Tip).options(joinedload(Tip.match)).where(Tip.id == tip.id)
    ).one()


def auto_settle_finished(
    db: Session,
    settings: Settings | None = None,
    *,
    owner_id: str | None = None,
    refresh_scores: bool = True,
) -> dict:
    """
    Settle each pending tip whose match is FINISHED with scores.

    POSTPONED / CANCELLED / SUSPENDED matches → tip auto-voided with reason in logs.

    refresh_scores=False uses DB only (no odds-api / API-Football call).
    """
    q = select(Tip).options(joinedload(Tip.match)).where(Tip.result == "pending")
    if owner_id:
        q = q.where(Tip.owner_id == owner_id)
    tips = db.scalars(q).unique().all()

    cfg = settings or get_settings()
    score_refresh = refresh_scores_for_matches(
        db,
        cfg,
        [t.match for t in tips if t.match is not None],
        fetch_external=refresh_scores,
    )

    settled: list[dict] = []
    voided: list[dict] = []
    unresolved: list[dict] = []
    now = datetime.now(timezone.utc)

    for tip in tips:
        m = tip.match
        if m is None:
            unresolved.append({"tip_id": tip.id, "reason": "no match"})
            continue
        status = normalize_match_status(m.status)
        if is_voidable_match_status(status):
            reason = void_reason_label(status)
            tip.result = "void"
            tip.settled_at = now
            suffix = f"auto-void: {reason}"
            tip.rationale = (
                f"{tip.rationale} | {suffix}".strip(" |")
                if tip.rationale
                else suffix
            )
            voided.append(tip_to_dict(tip))
            continue
        if status != "FINISHED" or m.home_score is None or m.away_score is None:
            unresolved.append(
                {
                    "tip_id": tip.id,
                    "reason": "match not finished",
                    "match_status": status,
                }
            )
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

    db.commit()
    parts: list[str] = []
    refresh_msg = score_refresh.get("message") or ""
    if refresh_msg:
        parts.append(refresh_msg)
    if voided:
        parts.append(f"Auto-voided {len(voided)} tip(s) (postponed/cancelled).")
    if settled:
        parts.append(f"Auto-settled {len(settled)} tip(s) from finished matches.")
    if not voided and not settled:
        parts.append("No tips settled — matches may still be in play or need scores.")
    msg = " ".join(parts)
    return {
        "settled_count": len(settled),
        "voided_count": len(voided),
        "unresolved_count": len(unresolved),
        "settled": settled,
        "voided": voided,
        "unresolved": unresolved[:20],
        "score_refresh": score_refresh,
        "message": msg,
    }


def tip_stats(db: Session, *, owner_id: str | None = None) -> dict:
    # Ignore auto-voided duplicates in the headline numbers
    stmt = (
        select(Tip.result, Tip.risk_profile, func.count())
        .where(Tip.result != "void")
    )
    if owner_id:
        stmt = stmt.where(Tip.owner_id == owner_id)
    rows = db.execute(stmt.group_by(Tip.result, Tip.risk_profile)).all()

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
