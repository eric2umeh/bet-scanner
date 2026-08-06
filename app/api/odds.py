"""
Odds endpoints (Phase 2).

Try in /docs after you add ODDS_API_KEY:
  POST /odds/sync
  GET  /odds/latest?match_id=1
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
    Pull 1X2 odds from The Odds API (free tier) into the `odds` table.

    Warning for learners: free plan has a monthly request budget.
    Don't spam this button.
    """
    result = sync_odds(db, settings)
    if not result.get("ok", True):
        raise HTTPException(status_code=400, detail=result["message"])
    return OddsSyncResult(**result)


@router.get("/latest", response_model=list[OddOut])
def list_latest_odds(
    match_id: int | None = Query(default=None, description="Filter by matches.id"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[Odd]:
    """Return recent odd snapshots (optionally for one match)."""
    stmt = select(Odd).order_by(Odd.captured_at.desc()).limit(limit)
    if match_id is not None:
        stmt = (
            select(Odd)
            .where(Odd.match_id == match_id)
            .order_by(Odd.captured_at.desc())
            .limit(limit)
        )
    return list(db.scalars(stmt))
