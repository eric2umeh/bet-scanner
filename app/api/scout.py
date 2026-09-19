"""
Phase 15A — Code Scout API.

Public list for signed-in clients; refresh / manual ingest for admin.
Feed is today → future only (past dated codes are purged).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps.admin import require_admin
from app.deps.auth import AuthUser
from app.schemas.scout import (
    ScoutCodeCreate,
    ScoutedCodeOut,
    ScoutListResponse,
    ScoutRefreshResponse,
)
from app.services.scout_codes import (
    code_to_dict,
    list_scouted_codes,
    purge_past_scouted_codes,
    upsert_scouted_code,
)
from app.services.scout_confidence import enrich_scouted_codes
from app.services.scout_ingest import (
    ingest_text_blob,
    refresh_all_sources,
)


router = APIRouter(prefix="/scout", tags=["scout"])


def _tz(settings: Settings) -> str:
    return getattr(settings, "app_timezone", None) or "Africa/Lagos"


def _list_for_band(
    db: Session,
    *,
    book: str,
    tz_name: str,
    min_odds: float | None,
    max_odds: float | None,
    min_folds: int | None,
    max_folds: int | None,
    band: str | None,
    sort: str,
    limit: int,
) -> list:
    if band == "good":
        rows_safer = list_scouted_codes(
            db,
            bookmaker=book,
            tz_name=tz_name,
            min_odds=min_odds,
            max_odds=max_odds,
            min_folds=min_folds,
            max_folds=max_folds,
            risk_band="safer",
            sort=sort,
            limit=limit,
        )
        rows_stretch = list_scouted_codes(
            db,
            bookmaker=book,
            tz_name=tz_name,
            min_odds=min_odds,
            max_odds=max_odds,
            min_folds=min_folds,
            max_folds=max_folds,
            risk_band="stretch",
            sort=sort,
            limit=limit,
        )
        seen: set[int] = set()
        rows = []
        for r in [*rows_safer, *rows_stretch]:
            if r.id in seen:
                continue
            seen.add(r.id)
            rows.append(r)
        if sort in ("odds_desc", "", None):
            rows.sort(key=lambda r: float(r.combined_odds or 0), reverse=True)
        return rows[:limit]
    return list_scouted_codes(
        db,
        bookmaker=book,
        tz_name=tz_name,
        min_odds=min_odds,
        max_odds=max_odds,
        min_folds=min_folds,
        max_folds=max_folds,
        risk_band=band,
        sort=sort,
        limit=limit,
    )


@router.get("/codes", response_model=ScoutListResponse, summary="List scouted booking codes")
def list_codes(
    bookmaker: str = Query(default="sportybet", description="sportybet | bet9ja"),
    days: int | None = Query(
        default=None,
        ge=1,
        le=60,
        description="Ignored — Scout only returns codes from today onward",
    ),
    min_odds: float | None = Query(default=None, ge=1.01),
    max_odds: float | None = Query(default=None, ge=1.01),
    min_folds: int | None = Query(default=None, ge=1, le=50),
    max_folds: int | None = Query(default=None, ge=1, le=50),
    risk_band: str | None = Query(
        default=None,
        description="safer|stretch|lottery|unknown|all|good (good = safer+stretch)",
    ),
    sort: str = Query(
        default="odds_desc",
        description="odds_desc|odds_asc|folds_desc|folds_asc|date_desc|date_asc",
    ),
    limit: int = Query(default=80, ge=1, le=200),
    refresh_if_empty: bool = Query(
        default=True,
        description="If no rows for this book, run a one-shot web+twitter ingest",
    ),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ScoutListResponse:
    del days  # lookback removed — today-forward only
    book = (bookmaker or "sportybet").strip().lower()
    if book not in ("sportybet", "bet9ja"):
        raise HTTPException(status_code=400, detail="bookmaker must be sportybet or bet9ja")

    tz_name = _tz(settings)
    purge_past_scouted_codes(db, tz_name=tz_name)

    band = (risk_band or "").strip().lower() or None
    rows = _list_for_band(
        db,
        book=book,
        tz_name=tz_name,
        min_odds=min_odds,
        max_odds=max_odds,
        min_folds=min_folds,
        max_folds=max_folds,
        band=band,
        sort=sort,
        limit=limit,
    )

    if refresh_if_empty and not rows:
        refresh_all_sources(db, settings)
        purge_past_scouted_codes(db, tz_name=tz_name)
        rows = _list_for_band(
            db,
            book=book,
            tz_name=tz_name,
            min_odds=min_odds,
            max_odds=max_odds,
            min_folds=min_folds,
            max_folds=max_folds,
            band=band,
            sort=sort,
            limit=limit,
        )

    msg = (
        f"{len(rows)} scouted {book} code(s)."
        if rows
        else ""
    )
    payloads = enrich_scouted_codes(db, rows, persist=True)
    if len(payloads) != len(rows):
        payloads = enrich_scouted_codes(db, rows, persist=False)
    out_codes = [
        ScoutedCodeOut(
            **code_to_dict(
                r,
                legs_count=p.get("legs_count", 0),
                legs_matched=p.get("legs_matched", 0),
                safety_edits=p.get("safety_edits") or [],
                safety_summary=p.get("safety_summary"),
            )
        )
        for r, p in zip(rows, payloads)
    ]
    return ScoutListResponse(
        count=len(out_codes),
        bookmaker=book,
        codes=out_codes,
        message=msg,
    )


@router.post(
    "/refresh",
    response_model=ScoutRefreshResponse,
    summary="Refresh scout feed from web + Twitter handles (admin)",
)
def refresh_codes(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _admin: AuthUser = Depends(require_admin),
) -> ScoutRefreshResponse:
    upserted, sources = refresh_all_sources(db, settings)
    purged = purge_past_scouted_codes(db, tz_name=_tz(settings))
    # Re-score today's feed so confidence is fresh after ingest
    for book in ("sportybet", "bet9ja"):
        rows = list_scouted_codes(db, bookmaker=book, tz_name=_tz(settings), limit=200)
        enrich_scouted_codes(db, rows, persist=True)
    return ScoutRefreshResponse(
        status="ok",
        upserted=upserted,
        sources=sources,
        message=(
            f"Upserted {upserted} code sighting(s) from {', '.join(sources) or 'no sources'}"
            f"; removed {purged} past-dated; confidence refreshed."
        ),
    )


@router.post(
    "/codes",
    response_model=ScoutedCodeOut,
    summary="Manually add a scouted code (admin)",
)
def create_code(
    body: ScoutCodeCreate,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _admin: AuthUser = Depends(require_admin),
) -> ScoutedCodeOut:
    book = (body.bookmaker or "sportybet").strip().lower()
    if book not in ("sportybet", "bet9ja"):
        raise HTTPException(status_code=400, detail="bookmaker must be sportybet or bet9ja")
    row = upsert_scouted_code(
        db,
        code_text=body.code_text,
        bookmaker=book,
        source=body.source or "manual",
        source_label=body.source_label,
        source_url=body.source_url,
        folds=body.folds,
        combined_odds=body.combined_odds,
        title=body.title,
        notes=body.notes,
        tz_name=_tz(settings),
    )
    if row is None:
        raise HTTPException(
            status_code=400,
            detail="Code date is in the past — Scout only keeps today → future.",
        )
    # upsert already ran confidence; re-enrich with odds context for legs match count
    payloads = enrich_scouted_codes(db, [row], persist=True)
    p = payloads[0] if payloads else {}
    return ScoutedCodeOut(
        **code_to_dict(
            row,
            legs_count=p.get("legs_count", 0),
            legs_matched=p.get("legs_matched", 0),
            safety_edits=p.get("safety_edits") or [],
            safety_summary=p.get("safety_summary"),
        )
    )


class ScoutIngestTextBody(BaseModel):
    text: str = Field(min_length=8, max_length=20_000)
    bookmaker: str = "sportybet"
    source_label: str = "Twitter paste"


@router.post(
    "/ingest-text",
    response_model=ScoutRefreshResponse,
    summary="Parse Twitter/tipster text for share codes (admin)",
)
def ingest_text(
    body: ScoutIngestTextBody,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _admin: AuthUser = Depends(require_admin),
) -> ScoutRefreshResponse:
    book = (body.bookmaker or "sportybet").strip().lower()
    if book not in ("sportybet", "bet9ja"):
        raise HTTPException(status_code=400, detail="bookmaker must be sportybet or bet9ja")
    n = ingest_text_blob(
        db,
        body.text,
        bookmaker=book,
        source_label=body.source_label or "Twitter paste",
        tz_name=_tz(settings),
    )
    return ScoutRefreshResponse(
        status="ok",
        upserted=n,
        sources=[body.source_label or "Twitter paste"],
        message=f"Parsed {n} code(s) from text (today onward only).",
    )
