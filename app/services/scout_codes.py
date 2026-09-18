"""
Phase 15A — Code Scout list / upsert helpers.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Select, select
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


def code_to_dict(row: ScoutedCode) -> dict:
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
    }


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
) -> ScoutedCode:
    code = (code_text or "").strip().upper()
    book = (bookmaker or "sportybet").strip().lower()
    odds_dec: Decimal | None = None
    if combined_odds is not None:
        try:
            odds_dec = Decimal(str(combined_odds))
        except Exception:  # noqa: BLE001
            odds_dec = None

    row = db.scalars(
        select(ScoutedCode).where(
            ScoutedCode.bookmaker == book,
            ScoutedCode.code_text == code,
        )
    ).first()

    band = risk_band_for_odds(odds_dec, folds)
    when = scouted_at or datetime.now(timezone.utc)

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
    return row


def list_scouted_codes(
    db: Session,
    *,
    bookmaker: str = "sportybet",
    days: int = 14,
    min_odds: float | None = None,
    max_odds: float | None = None,
    min_folds: int | None = None,
    max_folds: int | None = None,
    risk_band: str | None = None,
    sort: str = "odds_desc",
    limit: int = 80,
) -> list[ScoutedCode]:
    book = (bookmaker or "sportybet").strip().lower()
    since = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 60)))

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
        # odds_desc or date_desc default preference: newest high odds first
        if key == "date_desc":
            stmt = stmt.order_by(ScoutedCode.scouted_at.desc())
        else:
            stmt = stmt.order_by(
                ScoutedCode.combined_odds.desc().nullslast(),
                ScoutedCode.scouted_at.desc(),
            )

    stmt = stmt.limit(max(1, min(limit, 200)))
    return list(db.scalars(stmt).all())
