"""
Phase 15A — Code Scout API.

Public list for signed-in clients; refresh / manual ingest for admin.
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
from app.services.scout_codes import code_to_dict, list_scouted_codes, upsert_scouted_code
from app.services.scout_ingest import (
    ingest_text_blob,
    refresh_all_sources,
)


router = APIRouter(prefix="/scout", tags=["scout"])


@router.get("/codes", response_model=ScoutListResponse, summary="List scouted booking codes")
def list_codes(
    bookmaker: str = Query(default="sportybet", description="sportybet | bet9ja"),
    days: int = Query(default=14, ge=1, le=60),
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
    book = (bookmaker or "sportybet").strip().lower()
    if book not in ("sportybet", "bet9ja"):
        raise HTTPException(status_code=400, detail="bookmaker must be sportybet or bet9ja")

    band = (risk_band or "").strip().lower() or None
    # "good" = exclude lottery / unknown — safer + stretch only
    if band == "good":
        # Fetch a bit wider then filter in Python (two bands)
        rows_safer = list_scouted_codes(
            db,
            bookmaker=book,
            days=days,
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
            days=days,
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
        # Re-sort lightly by odds desc if that was requested
        if sort in ("odds_desc", "", None):
            rows.sort(
                key=lambda r: float(r.combined_odds or 0),
                reverse=True,
            )
        rows = rows[:limit]
    else:
        rows = list_scouted_codes(
            db,
            bookmaker=book,
            days=days,
            min_odds=min_odds,
            max_odds=max_odds,
            min_folds=min_folds,
            max_folds=max_folds,
            risk_band=band,
            sort=sort,
            limit=limit,
        )

    if refresh_if_empty and not rows:
        refresh_all_sources(db, settings)
        if band == "good":
            rows_safer = list_scouted_codes(
                db,
                bookmaker=book,
                days=days,
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
                days=days,
                min_odds=min_odds,
                max_odds=max_odds,
                min_folds=min_folds,
                max_folds=max_folds,
                risk_band="stretch",
                sort=sort,
                limit=limit,
            )
            seen2: set[int] = set()
            rows = []
            for r in [*rows_safer, *rows_stretch]:
                if r.id in seen2:
                    continue
                seen2.add(r.id)
                rows.append(r)
            if sort in ("odds_desc", "", None):
                rows.sort(key=lambda r: float(r.combined_odds or 0), reverse=True)
            rows = rows[:limit]
        else:
            rows = list_scouted_codes(
                db,
                bookmaker=book,
                days=days,
                min_odds=min_odds,
                max_odds=max_odds,
                min_folds=min_folds,
                max_folds=max_folds,
                risk_band=band,
                sort=sort,
                limit=limit,
            )

    msg = (
        f"{len(rows)} scouted {book} code(s). Risk band is a heuristic from odds/folds — not a tip."
        if rows
        else (
            f"No scouted codes for {book} yet. Pull to refresh, or ask an admin to run Scout refresh."
            if book == "bet9ja"
            else f"No scouted codes for {book} in the last {days} days."
        )
    )
    return ScoutListResponse(
        count=len(rows),
        bookmaker=book,
        codes=[ScoutedCodeOut(**code_to_dict(r)) for r in rows],
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
    return ScoutRefreshResponse(
        status="ok",
        upserted=upserted,
        sources=sources,
        message=(
            f"Upserted {upserted} code sighting(s) from {', '.join(sources) or 'no sources'}."
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
    )
    return ScoutedCodeOut(**code_to_dict(row))


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
    )
    return ScoutRefreshResponse(
        status="ok",
        upserted=n,
        sources=[body.source_label or "Twitter paste"],
        message=f"Parsed {n} code(s) from text.",
    )
