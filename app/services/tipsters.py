"""
Tipster + booking code ops (Phase 6).
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.tipster import BookingCode, Tipster
from app.services.code_parse import normalize_code, parse_markets_summary


def tipster_to_dict(t: Tipster, *, include_counts: bool = True) -> dict:
    out = {
        "id": t.id,
        "name": t.name,
        "handle": t.handle,
        "platform": t.platform,
        "notes": t.notes,
        "created_at": t.created_at,
    }
    if include_counts and t.codes is not None:
        codes = t.codes
        out["codes_total"] = len(codes)
        out["codes_pending"] = sum(1 for c in codes if c.result == "pending")
        out["codes_settled"] = sum(1 for c in codes if c.result in ("won", "lost"))
    return out


def code_to_dict(c: BookingCode) -> dict:
    return {
        "id": c.id,
        "tipster_id": c.tipster_id,
        "tipster_name": c.tipster.name if c.tipster else "?",
        "code_text": c.code_text,
        "bookmaker": c.bookmaker,
        "markets_summary": c.markets_summary,
        "stake_ngn": c.stake_ngn,
        "odds_price": c.odds_price,
        "source": c.source,
        "notes": c.notes,
        "result": c.result,
        "created_at": c.created_at,
        "settled_at": c.settled_at,
    }


def create_tipster(
    db: Session,
    *,
    name: str,
    handle: str | None = None,
    platform: str | None = None,
    notes: str | None = None,
    owner_id: str | None = None,
) -> Tipster:
    tipster = Tipster(
        name=name.strip(),
        handle=(handle or "").strip() or None,
        platform=(platform or "").strip().lower() or None,
        notes=notes,
        owner_id=owner_id,
    )
    db.add(tipster)
    db.commit()
    db.refresh(tipster)
    tipster = db.scalars(
        select(Tipster)
        .options(joinedload(Tipster.codes))
        .where(Tipster.id == tipster.id)
    ).unique().one()
    return tipster


def list_tipsters(
    db: Session,
    limit: int = 50,
    *,
    owner_id: str | None = None,
) -> list[Tipster]:
    stmt = (
        select(Tipster)
        .options(joinedload(Tipster.codes))
        .order_by(Tipster.id.desc())
        .limit(limit)
    )
    if owner_id:
        stmt = stmt.where(Tipster.owner_id == owner_id)
    return list(db.scalars(stmt).unique().all())


def get_tipster(db: Session, tipster_id: int) -> Tipster | None:
    return db.scalars(
        select(Tipster)
        .options(joinedload(Tipster.codes))
        .where(Tipster.id == tipster_id)
    ).unique().first()


def submit_code(
    db: Session,
    *,
    tipster_id: int,
    code_text: str,
    bookmaker: str = "sportybet",
    stake_ngn: Decimal | None = None,
    odds_price: Decimal | None = None,
    source: str = "manual",
    notes: str | None = None,
    markets_summary: str | None = None,
) -> tuple[BookingCode | None, str]:
    tipster = db.get(Tipster, tipster_id)
    if tipster is None:
        return None, "error: tipster not found"

    code = normalize_code(code_text)
    if not code:
        return None, "error: code_text empty"

    book = (bookmaker or "sportybet").strip().lower()
    summary = markets_summary or parse_markets_summary(notes, code)

    # Skip exact pending duplicate for same tipster+code+book
    dup = db.scalars(
        select(BookingCode).where(
            BookingCode.tipster_id == tipster_id,
            BookingCode.code_text == code,
            BookingCode.bookmaker == book,
            BookingCode.result == "pending",
        )
    ).first()
    if dup is not None:
        dup = db.scalars(
            select(BookingCode)
            .options(joinedload(BookingCode.tipster))
            .where(BookingCode.id == dup.id)
        ).one()
        return dup, "duplicate"

    row = BookingCode(
        tipster_id=tipster_id,
        code_text=code,
        bookmaker=book,
        markets_summary=summary,
        stake_ngn=stake_ngn,
        odds_price=odds_price,
        source=(source or "manual").strip().lower(),
        notes=notes,
        result="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    row = db.scalars(
        select(BookingCode)
        .options(joinedload(BookingCode.tipster))
        .where(BookingCode.id == row.id)
    ).one()
    return row, "created"


def list_codes(
    db: Session,
    *,
    tipster_id: int | None = None,
    result: str | None = None,
    limit: int = 50,
    owner_id: str | None = None,
) -> list[BookingCode]:
    stmt = (
        select(BookingCode)
        .options(joinedload(BookingCode.tipster))
        .order_by(BookingCode.id.desc())
        .limit(limit)
    )
    if owner_id:
        stmt = stmt.join(Tipster).where(Tipster.owner_id == owner_id)
    if tipster_id is not None:
        stmt = stmt.where(BookingCode.tipster_id == tipster_id)
    if result:
        stmt = stmt.where(BookingCode.result == result.strip().lower())
    return list(db.scalars(stmt).unique().all())


def settle_code(
    db: Session,
    code_id: int,
    result: str,
) -> tuple[BookingCode | None, str]:
    result = result.strip().lower()
    if result not in ("won", "lost", "void", "pending"):
        return None, "error: result must be won|lost|void|pending"

    row = db.scalars(
        select(BookingCode)
        .options(joinedload(BookingCode.tipster))
        .where(BookingCode.id == code_id)
    ).first()
    if row is None:
        return None, "error: code not found"

    row.result = result
    row.settled_at = (
        None if result == "pending" else datetime.now(timezone.utc)
    )
    db.commit()
    db.refresh(row)
    return row, "updated"


def tipster_leaderboard(
    db: Session,
    *,
    min_settled: int = 1,
    owner_id: str | None = None,
) -> dict:
    """
    Rank tipsters by verified settled codes (won/lost).
    ROI uses stake × odds when both present; else hit-rate only.
    """
    tipsters = list_tipsters(db, limit=200, owner_id=owner_id)
    rows: list[dict] = []

    for t in tipsters:
        settled = [c for c in t.codes if c.result in ("won", "lost")]
        if len(settled) < min_settled:
            continue
        won = sum(1 for c in settled if c.result == "won")
        lost = len(settled) - won
        hit = round(100.0 * won / len(settled), 1) if settled else None

        staked = Decimal("0")
        returned = Decimal("0")
        roi_samples = 0
        for c in settled:
            if c.stake_ngn is None:
                continue
            stake = Decimal(str(c.stake_ngn))
            staked += stake
            roi_samples += 1
            if c.result == "won":
                odds = Decimal(str(c.odds_price)) if c.odds_price else Decimal("1")
                returned += stake * odds
            # lost → return 0

        profit = returned - staked if roi_samples else None
        roi_pct = (
            float((profit / staked * Decimal("100")).quantize(Decimal("0.1")))
            if roi_samples and staked > 0 and profit is not None
            else None
        )

        rows.append(
            {
                "tipster_id": t.id,
                "name": t.name,
                "handle": t.handle,
                "platform": t.platform,
                "settled": len(settled),
                "won": won,
                "lost": lost,
                "hit_rate_pct": hit,
                "staked_ngn": staked if roi_samples else None,
                "returned_ngn": returned if roi_samples else None,
                "profit_ngn": profit,
                "roi_pct": roi_pct,
                "pending": sum(1 for c in t.codes if c.result == "pending"),
            }
        )

    # Prefer ROI when available, else hit-rate, then sample size
    def sort_key(r: dict) -> tuple:
        roi = r["roi_pct"] if r["roi_pct"] is not None else -9999.0
        hit = r["hit_rate_pct"] if r["hit_rate_pct"] is not None else -1.0
        return (roi, hit, r["settled"])

    rows.sort(key=sort_key, reverse=True)

    return {
        "count": len(rows),
        "min_settled": min_settled,
        "leaderboard": rows,
        "message": (
            f"{len(rows)} tipster(s) with ≥{min_settled} settled code(s). "
            "Rank uses ROI when stake+odds logged; else hit-rate. "
            "Opaque booking codes are tracked — not auto-decoded from SportyBet."
        ),
    }
