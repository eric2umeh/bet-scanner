"""
Match endpoints.

Try these in Postman / browser after the server is running:
  GET  http://127.0.0.1:8000/matches/today
  POST http://127.0.0.1:8000/matches/sync   (pull from football-data.org)
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import Match
from app.schemas.match import MatchOut, SyncResult
from app.services.football_data import FootballDataError
from app.services.sync_matches import sync_matches_for_today

router = APIRouter(prefix="/matches", tags=["matches"])


@router.get("/today", response_model=list[MatchOut])
def list_todays_matches(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[Match]:
    """
    Return matches whose kickoff falls on 'today' in APP_TIMEZONE.

    Learning note:
    - Kickoff is stored in UTC
    - 'Today' for a Lagos user is a local calendar day, not UTC midnight
    """
    tz = ZoneInfo(settings.app_timezone)
    local_now = datetime.now(tz)
    start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)

    start_utc = start_local.astimezone(ZoneInfo("UTC"))
    end_utc = end_local.astimezone(ZoneInfo("UTC"))

    stmt = (
        select(Match)
        .where(Match.kickoff_at >= start_utc, Match.kickoff_at < end_utc)
        .order_by(Match.kickoff_at.asc())
    )
    return list(db.scalars(stmt))


@router.post("/sync", response_model=SyncResult)
def sync_matches(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SyncResult:
    """
    Manually trigger the same job the daily cron will run.

    Useful while learning — call this from Postman before GET /matches/today.
    """
    try:
        result = sync_matches_for_today(db, settings)
    except FootballDataError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SyncResult(**result)