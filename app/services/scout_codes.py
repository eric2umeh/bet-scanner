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


def scout_keep_since_utc(tz_name: str | None = None, *, max_age_days: int = 0) -> datetime:
    """Earliest scouted_at to keep (today minus max_age_days, local midnight)."""
    from datetime import timedelta

    z = app_zone(tz_name)
    days = max(0, int(max_age_days or 0))
    local_midnight = datetime.now(z).replace(hour=0, minute=0, second=0, microsecond=0)
    return (local_midnight - timedelta(days=days)).astimezone(timezone.utc)


def is_past_scout_day(when: datetime | None, tz_name: str | None = None) -> bool:
    """True if the code's date is before today (local app day)."""
    if when is None:
        return False
    z = app_zone(tz_name)
    w = when if when.tzinfo is not None else when.replace(tzinfo=timezone.utc)
    local_day = w.astimezone(z).date()
    return local_day < datetime.now(z).date()


def is_stale_scout_day(
    when: datetime | None,
    tz_name: str | None = None,
    *,
    max_age_days: int = 0,
) -> bool:
    """True if tip date is older than today − max_age_days (local)."""
    if when is None:
        return False
    z = app_zone(tz_name)
    w = when if when.tzinfo is not None else when.replace(tzinfo=timezone.utc)
    local_day = w.astimezone(z).date()
    days = max(0, int(max_age_days or 0))
    from datetime import timedelta

    cutoff = datetime.now(z).date() - timedelta(days=days)
    return local_day < cutoff


def code_to_dict(
    row: ScoutedCode,
    *,
    legs_count: int = 0,
    legs_matched: int = 0,
    safety_edits: list | None = None,
    safety_summary: str | None = None,
    convertible: bool | None = None,
) -> dict:
    from app.services.scout_convert import can_convert_scout_row, other_book

    conf = row.confidence_pct
    conf_f = float(conf) if conf is not None else None
    label = row.confidence_label
    verification = (row.verification or "unverified").strip().lower()
    if conf_f is None and not label:
        label = "Unverified — copy only."
    can = can_convert_scout_row(row) if convertible is None else bool(convertible)
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
        "convertible": can,
        "convert_target": other_book(row.bookmaker) if can else None,
    }


def purge_past_scouted_codes(
    db: Session,
    *,
    tz_name: str | None = None,
    max_age_days: int = 0,
) -> int:
    """Delete codes older than the keep window (default: before today)."""
    since = scout_keep_since_utc(tz_name, max_age_days=max_age_days)
    result = db.execute(delete(ScoutedCode).where(ScoutedCode.scouted_at < since))
    db.commit()
    return int(result.rowcount or 0)


def purge_stale_web_listings(db: Session) -> int:
    """
    Drop previously scraped web/hub codes before a fresh ingest.

    Aggregator pages keep old (expired) booking codes in the HTML. We used to
    re-stamp those as 'today', which made Scout show codes SportyBet rejects.
    Clearing web/hub rows first, then re-ingesting only same-day tip dates,
    keeps the feed honest.
    """
    from sqlalchemy import or_

    result = db.execute(
        delete(ScoutedCode).where(
            or_(
                ScoutedCode.source.in_(("web", "hub")),
                ScoutedCode.notes.ilike("%Source tip date%"),
            )
        )
    )
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
    live_listing: bool = False,
    max_age_days: int = 0,
) -> ScoutedCode | None:
    code = (code_text or "").strip().upper()
    book = (bookmaker or "sportybet").strip().lower()
    odds_dec: Decimal | None = None
    if combined_odds is not None:
        try:
            odds_dec = Decimal(str(combined_odds))
        except Exception:  # noqa: BLE001
            odds_dec = None

    now = datetime.now(timezone.utc)
    when = scouted_at or now
    # Aggregator pages lag a day; allow tip dates within max_age_days.
    # Never re-stamp old tip days as "today" — keep the real tip date.
    if live_listing:
        if scouted_at is not None and is_stale_scout_day(
            scouted_at, tz_name, max_age_days=max_age_days
        ):
            return None
        when = scouted_at or now
    elif is_stale_scout_day(when, tz_name, max_age_days=max_age_days):
        return None

    note_bits = [notes] if notes else []
    if (
        scouted_at is not None
        and is_past_scout_day(scouted_at, tz_name)
        and not is_stale_scout_day(scouted_at, tz_name, max_age_days=max_age_days)
    ):
        try:
            note_bits.append(f"Source tip date {scouted_at.date().isoformat()} — may be expired")
        except Exception:  # noqa: BLE001
            pass
    notes_merged = " · ".join(b for b in note_bits if b) or None

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
            notes=notes_merged,
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
        if notes_merged:
            row.notes = notes_merged
        # Prefer newer sighting
        if row.scouted_at is None or when >= row.scouted_at:
            row.scouted_at = when

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
    days: int | None = None,  # noqa: ARG001 — kept for API compat
    max_age_days: int = 0,
) -> list[ScoutedCode]:
    del days  # ignored: Scout uses max_age_days window
    book = (bookmaker or "sportybet").strip().lower()
    since = scout_keep_since_utc(tz_name, max_age_days=max_age_days)

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
