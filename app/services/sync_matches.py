"""
Pull fixtures from football-data.org and upsert into `matches`.

Upsert = insert if new, update if we already have that external_id.
This keeps the daily cron safe to re-run.
"""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from dateutil import parser as date_parser
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Match
from app.services.football_data import FootballDataClient, FootballDataError


def _local_today(tz_name: str) -> date:
    return datetime.now(ZoneInfo(tz_name)).date()


def sync_matches_for_today(db: Session, settings: Settings) -> dict:
    """
    Sync today's (+ tomorrow's) matches for configured competitions.

    Why tomorrow too?
    - Kickoffs after midnight UTC can still be "today" in Lagos
    - Gives the app fixtures ready ahead of time
    """
    client = FootballDataClient(settings)
    today = _local_today(settings.app_timezone)
    # football-data v4: dateTo is EXCLUSIVE, so +2 days includes today + tomorrow
    date_to_exclusive = today + timedelta(days=2)

    upserted = 0
    errors: list[str] = []

    for code in settings.competition_codes:
        try:
            raw_matches = client.get_matches_for_competition(
                code, today, date_to_exclusive
            )
        except FootballDataError as exc:
            errors.append(f"{code}: {exc}")
            continue

        for raw in raw_matches:
            if _upsert_match(db, raw):
                upserted += 1

        # Be polite to free-tier rate limits between competitions
        import time

        time.sleep(1.5)

    db.commit()

    message = (
        f"Upserted {upserted} match row(s) for {today} "
        f"(dateTo exclusive={date_to_exclusive})."
    )
    if errors:
        message += " Some competitions failed: " + "; ".join(errors)

    return {
        "competitions": settings.competition_codes,
        "upserted": upserted,
        "message": message,
    }


def _upsert_match(db: Session, raw: dict) -> bool:
    """Return True if a row was inserted or updated."""
    external_id = str(raw["id"])
    provider = "football-data"

    competition = raw.get("competition") or {}
    home = (raw.get("homeTeam") or {}).get("name") or "TBD"
    away = (raw.get("awayTeam") or {}).get("name") or "TBD"
    score = raw.get("score") or {}
    full_time = score.get("fullTime") or {}

    kickoff = date_parser.isoparse(raw["utcDate"])
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)

    existing = db.scalar(
        select(Match).where(
            Match.external_id == external_id,
            Match.provider == provider,
        )
    )

    if existing is None:
        match = Match(
            external_id=external_id,
            provider=provider,
            competition_code=competition.get("code") or "UNK",
            competition_name=competition.get("name") or "Unknown",
            home_team=home,
            away_team=away,
            kickoff_at=kickoff,
            status=raw.get("status") or "SCHEDULED",
            home_score=full_time.get("home"),
            away_score=full_time.get("away"),
        )
        db.add(match)
        return True

    existing.competition_code = competition.get("code") or existing.competition_code
    existing.competition_name = competition.get("name") or existing.competition_name
    existing.home_team = home
    existing.away_team = away
    existing.kickoff_at = kickoff
    existing.status = raw.get("status") or existing.status
    existing.home_score = full_time.get("home")
    existing.away_score = full_time.get("away")
    return True