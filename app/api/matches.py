"""
Match endpoints.

Try these in /docs:
  GET  /matches/today
  GET  /matches/upcoming
  POST /matches/sync          ← runs all enabled fixture providers
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import Match
from app.providers.api_football import ApiFootballError
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
    Return remaining matches today (kickoff still in the future).

    Past kickoffs are excluded — already started/finished games are not
    useful for placing new bets.
    """
    tz = ZoneInfo(settings.app_timezone)
    local_now = datetime.now(tz)
    start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)

    now_utc = local_now.astimezone(ZoneInfo("UTC"))
    end_utc = end_local.astimezone(ZoneInfo("UTC"))

    stmt = (
        select(Match)
        .where(Match.kickoff_at >= now_utc, Match.kickoff_at < end_utc)
        .order_by(Match.kickoff_at.asc())
    )
    return list(db.scalars(stmt))


@router.get("/upcoming", response_model=list[MatchOut])
def list_upcoming_matches(
    days: int = 14,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[Match]:
    """Return matches from now through the next N days (default 14)."""
    days = max(1, min(days, 60))
    tz = ZoneInfo(settings.app_timezone)
    now = datetime.now(tz).astimezone(ZoneInfo("UTC"))
    end = now + timedelta(days=days)

    stmt = (
        select(Match)
        .where(Match.kickoff_at >= now, Match.kickoff_at < end)
        .order_by(Match.kickoff_at.asc())
    )
    return list(db.scalars(stmt))


@router.post("/sync", response_model=SyncResult)
def sync_matches(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SyncResult:
    """
    Pull fixtures from every provider listed in FIXTURE_PROVIDERS.

    Current free providers:
      - football-data  (big leagues calendar)
      - api-football   (today + tomorrow)
    """
    try:
        result = sync_matches_for_today(db, settings)
    except (FootballDataError, ApiFootballError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SyncResult(**result)
