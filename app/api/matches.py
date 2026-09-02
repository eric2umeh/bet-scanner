"""
Match endpoints.

Try these in /docs:
  GET  /matches/today
  GET  /matches/upcoming
  POST /matches/sync          ← runs all enabled fixture providers
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import Match, Odd
from app.providers.api_football import ApiFootballError
from app.schemas.match import MatchOut, SyncResult
from app.services.bookmakers import configured_odds_books, normalize_book_key
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


@router.get("/bettable", response_model=list[MatchOut])
def list_bettable_matches(
    days: int = 21,
    bookmakers: str | None = Query(
        None,
        description="Comma-separated book keys (default: ODDS_API_IO_BOOKMAKERS)",
    ),
    max_age_minutes: int | None = Query(
        None,
        description="Ignore odds older than this (default: ARB_MAX_ODDS_AGE_MINUTES)",
    ),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[Match]:
    """
    Matches that have fresh odds on your NG books — use for the Today tab.

    Only rows linked in the `odds` table count (odds-api.io sync). Calendar
    fixtures without a recent odds pull will not appear here.
    """
    days = max(1, min(days, 60))
    if bookmakers:
        books = [normalize_book_key(b) for b in bookmakers.split(",") if b.strip()]
    else:
        books = configured_odds_books(settings)
    if not books:
        books = ["sportybet"]

    max_age = (
        max_age_minutes
        if max_age_minutes is not None
        else settings.arb_max_odds_age_minutes
    )
    now = datetime.now(ZoneInfo("UTC"))
    end = now + timedelta(days=days)
    cutoff = now - timedelta(minutes=max_age)

    stmt = (
        select(Match)
        .join(Odd, Odd.match_id == Match.id)
        .where(
            Match.kickoff_at >= now,
            Match.kickoff_at < end,
            Odd.bookmaker.in_(books),
            Odd.captured_at >= cutoff,
        )
        .distinct()
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

    Default:
      - odds-api-io   → pending SportyBet/Bet9ja events
    Optional:
      - football-data → big leagues calendar
      - api-football  → when API_FOOTBALL_ENABLED=true
    """
    try:
        result = sync_matches_for_today(db, settings)
    except (FootballDataError, ApiFootballError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return SyncResult(**result)
