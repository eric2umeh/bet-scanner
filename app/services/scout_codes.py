"""
Phase 15A — Code Scout list / upsert helpers.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import Select, delete, select
from sqlalchemy.orm import Session

from app.models.scout_code import ScoutedCode


def risk_band_for_odds(odds: Decimal | float | None, folds: int | None = None) -> str:
    """Heuristic risk label for feed sorting — not a prediction."""
    if odds is None and folds is None:
        return "unknown"
    o = float(odds) if odds is not None else None
    if folds is not None and folds >= 10:
        return "lottery"
    if o is None:
        if folds is not None and folds >= 6:
            return "stretch"
        if folds is not None and folds <= 3:
            return "safer"
        return "unknown"
    if o >= 50:
        return "lottery"
    if o >= 8:
        return "stretch"
    return "safer"


def hub_url_for(bookmaker: str, code: str) -> str | None:
    book = (bookmaker or "").strip().lower()
    c = (code or "").strip().upper()
    if not c:
        return None
    if book == "sportybet":
        return f"https://www.sportybet.com/ng/?shareCode={c}&c=ng"
    if book == "bet9ja":
        return "https://www.bet9ja.com/"
    return None


def app_zone(tz_name: str | None = None) -> ZoneInfo:
    try:
        return ZoneInfo((tz_name or "Africa/Lagos").strip() or "Africa/Lagos")
    except Exception:  # noqa: BLE001
        return ZoneInfo("Africa/Lagos")


def start_of_today_utc(tz_name: str | None = None) -> datetime:
    """Midnight today in app timezone, as aware UTC for DB compares."""
    z = app_zone(tz_name)
    local_midnight = datetime.now(z).replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight.astimezone(timezone.utc)


def is_past_scout_day(when: datetime | None, tz_name: str | None = None) -> bool:
    """True if the code's date is before today (local app day)."""
    if when is None:
        return False
    z = app_zone(tz_name)
    w = when if when.tzinfo is not None else when.replace(tzinfo=timezone.utc)
    local_day = w.astimezone(z).date()
    return local_day < datetime.now(z).date()


def code_to_dict(
    row: ScoutedCode,
    *,
    legs_count: int = 0,
    legs_matched: int = 0,
    safety_edits: list | None = None,
    safety_summary: str | None = None,
) -> dict:
    conf = row.confidence_pct
    conf_f = float(conf) if conf is not None else None
    label = row.confidence_label
    verification = (row.verification or "unverified").strip().lower()
    if conf_f is None and not label:
        label = "Unverified — copy only."
    return {
        "id": row.id,
        "code_text": row.code_text,
        "bookmaker": row.bookmaker,
        "source": row.source,
        "source_label": row.source_label,
        "source_url": row.source_url,
        "folds": row.folds,
        "combined_odds": row.combined_odds,
        "risk_band": row.risk_band or "unknown",
        "title": row.title,
        "notes": row.notes,
        "scouted_at": row.scouted_at,
        "hub_url": hub_url_for(row.bookmaker, row.code_text),
        "verification": verification,
        "confidence_pct": conf_f,
        "confidence_label": label or "Unverified — copy only.",
        "legs_count": legs_count,
        "legs_matched": legs_matched,
        "safety_edits": safety_edits or [],
        "safety_summary": safety_summary,
    }


def purge_past_scouted_codes(db: Session, *, tz_name: str | None = None) -> int:
    """Delete codes dated before today (settled / expired listings)."""
    since = start_of_today_utc(tz_name)
    result = db.execute(delete(ScoutedCode).where(ScoutedCode.scouted_at < since))
    db.commit()
    return int(result.rowcount or 0)


def upsert_scouted_code(
    db: Session,
    *,
    code_text: str,
    bookmaker: str,
    source: str = "web",
    source_label: str | None = None,
    source_url: str | None = None,
    folds: int | None = None,
    combined_odds: Decimal | float | None = None,
    title: str | None = None,
    notes: str | None = None,
    scouted_at: datetime | None = None,
    tz_name: str | None = None,
) -> ScoutedCode | None:
    code = (code_text or "").strip().upper()
    book = (bookmaker or "sportybet").strip().lower()
    odds_dec: Decimal | None = None
    if combined_odds is not None:
        try:
            odds_dec = Decimal(str(combined_odds))
        except Exception:  # noqa: BLE001
            odds_dec = None

    when = scouted_at or datetime.now(timezone.utc)
    # Never re-add yesterday’s (or older) tipster/web codes — usually settled/unavailable.
    if is_past_scout_day(when, tz_name):
        return None

    row = db.scalars(
        select(ScoutedCode).where(
            ScoutedCode.bookmaker == book,
            ScoutedCode.code_text == code,
        )
    ).first()

    band = risk_band_for_odds(odds_dec, folds)

    if row is None:
        row = ScoutedCode(
            code_text=code,
            bookmaker=book,
            source=source,
            source_label=source_label,
            source_url=source_url,
            folds=folds,
            combined_odds=odds_dec,
            risk_band=band,
            title=title,
            notes=notes,
            scouted_at=when,
        )
        db.add(row)
    else:
        row.source = source or row.source
        if source_label:
            row.source_label = source_label
        if source_url:
            row.source_url = source_url
        if folds is not None:
            row.folds = folds
        if odds_dec is not None:
            row.combined_odds = odds_dec
        row.risk_band = risk_band_for_odds(row.combined_odds, row.folds)
        if title:
            row.title = title
        if notes:
            row.notes = notes
        # Prefer newer sighting
        if row.scouted_at is None or when >= row.scouted_at:
            row.scouted_at = when

    db.commit()
    db.refresh(row)
    # Phase 15B — attach legs / confidence when possible (no ctx → rich meta or unverified)
    from app.services.scout_confidence import compute_scout_confidence

    compute_scout_confidence(row, db=db, persist=True)
    db.commit()
    db.refresh(row)
    return row


def list_scouted_codes(
    db: Session,
    *,
    bookmaker: str = "sportybet",
    tz_name: str | None = None,
    min_odds: float | None = None,
    max_odds: float | None = None,
    min_folds: int | None = None,
    max_folds: int | None = None,
    risk_band: str | None = None,
    sort: str = "odds_desc",
    limit: int = 80,
    days: int | None = None,  # noqa: ARG001 — kept for API compat; feed is today-forward only
) -> list[ScoutedCode]:
    del days  # ignored: Scout shows today → future only
    book = (bookmaker or "sportybet").strip().lower()
    since = start_of_today_utc(tz_name)

    stmt: Select[tuple[ScoutedCode]] = select(ScoutedCode).where(
        ScoutedCode.bookmaker == book,
        ScoutedCode.scouted_at >= since,
    )
    if min_odds is not None:
        stmt = stmt.where(ScoutedCode.combined_odds >= Decimal(str(min_odds)))
    if max_odds is not None:
        stmt = stmt.where(ScoutedCode.combined_odds <= Decimal(str(max_odds)))
    if min_folds is not None:
        stmt = stmt.where(ScoutedCode.folds >= min_folds)
    if max_folds is not None:
        stmt = stmt.where(ScoutedCode.folds <= max_folds)
    if risk_band and risk_band != "all":
        stmt = stmt.where(ScoutedCode.risk_band == risk_band.strip().lower())

    key = (sort or "odds_desc").strip().lower()
    if key == "odds_asc":
        stmt = stmt.order_by(ScoutedCode.combined_odds.asc().nullslast(), ScoutedCode.scouted_at.desc())
    elif key == "folds_desc":
        stmt = stmt.order_by(ScoutedCode.folds.desc().nullslast(), ScoutedCode.scouted_at.desc())
    elif key == "folds_asc":
        stmt = stmt.order_by(ScoutedCode.folds.asc().nullslast(), ScoutedCode.scouted_at.desc())
    elif key == "date_asc":
        stmt = stmt.order_by(ScoutedCode.scouted_at.asc())
    else:
        if key == "date_desc":
            stmt = stmt.order_by(ScoutedCode.scouted_at.desc())
        else:
            stmt = stmt.order_by(
                ScoutedCode.combined_odds.desc().nullslast(),
                ScoutedCode.scouted_at.desc(),
            )

    stmt = stmt.limit(max(1, min(limit, 200)))
    return list(db.scalars(stmt).all())
