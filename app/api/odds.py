"""
Odds endpoints (Phase 2 + 3B).

Try in /docs:
  POST /odds/sync          ← runs providers in ODDS_PROVIDERS
  GET  /odds/latest
  GET  /odds/latest?bookmaker=sportybet
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import Odd
from app.schemas.odd import OddOut, OddsSyncResult
from app.services.sync_odds import sync_odds

router = APIRouter(prefix="/odds", tags=["odds"])


@router.post("/sync", response_model=OddsSyncResult)
def sync_odds_endpoint(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> OddsSyncResult:
    """
    Pull 1X2 odds from enabled providers into the `odds` table.

    Phase 3B free path: ODDS_PROVIDERS=odds-api-io (SportyBet + Bet9ja).
    Requires ODDS_SYNC_ENABLED=true and ODDS_API_IO_KEY set.
    Don't spam — free APIs have hourly/daily limits.
    """
    result = sync_odds(db, settings)
    if not result.get("ok", True):
        raise HTTPException(status_code=400, detail=result["message"])
    return OddsSyncResult(**result)


@router.get("/latest", response_model=list[OddOut])
def list_latest_odds(
    match_id: int | None = Query(default=None, description="Filter by matches.id"),
    bookmaker: str | None = Query(
        default=None,
        description="Filter by book key, e.g. sportybet or bet9ja",
    ),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[Odd]:
    """Return recent odd snapshots (optionally for one match / book)."""
    stmt = select(Odd).order_by(Odd.captured_at.desc())
    if match_id is not None:
        stmt = stmt.where(Odd.match_id == match_id)
    if bookmaker:
        stmt = stmt.where(Odd.bookmaker == bookmaker.strip().lower())
    stmt = stmt.limit(limit)
    return list(db.scalars(stmt))
