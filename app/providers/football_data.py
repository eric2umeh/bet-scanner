"""
Provider: football-data.org (free tier)

Good for: major European leagues, season calendars.
Less ideal for: "every match worldwide today" (free tier is competition-scoped).

Docs: https://docs.football-data.org/general/v4/index.html
"""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from dateutil import parser as date_parser

from app.config import Settings
from app.providers.base import FixtureMatch
from app.services.football_data import FootballDataClient, FootballDataError


class FootballDataProvider:
    """Wraps our existing FootballDataClient and returns FixtureMatch objects."""

    name = "football-data"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = FootballDataClient(settings)

    def fetch_upcoming(self) -> list[FixtureMatch]:
        """
        Pull matches for configured competitions over sync_days_ahead.

        football-data v4: dateTo is EXCLUSIVE.
        """
        today = datetime.now(ZoneInfo(self.settings.app_timezone)).date()
        days = max(1, self.settings.sync_days_ahead)
        date_to_exclusive = today + timedelta(days=days + 1)

        out: list[FixtureMatch] = []
        errors: list[str] = []

        for code in self.settings.competition_codes:
            try:
                raw_matches = self.client.get_matches_for_competition(
                    code, today, date_to_exclusive
                )
            except FootballDataError as exc:
                errors.append(f"{code}: {exc}")
                continue

            for raw in raw_matches:
                out.append(self._to_fixture(raw))

            # Be polite between competition calls on free tier
            import time

            time.sleep(1.5)

        if errors:
            print(f"[football-data] partial errors: {'; '.join(errors)}")
        return out

    def _to_fixture(self, raw: dict) -> FixtureMatch:
        competition = raw.get("competition") or {}
        home = (raw.get("homeTeam") or {}).get("name") or "TBD"
        away = (raw.get("awayTeam") or {}).get("name") or "TBD"
        score = raw.get("score") or {}
        full_time = score.get("fullTime") or {}

        kickoff = date_parser.isoparse(raw["utcDate"])
        if kickoff.tzinfo is None:
            kickoff = kickoff.replace(tzinfo=timezone.utc)

        return FixtureMatch(
            external_id=str(raw["id"]),
            provider=self.name,
            competition_code=competition.get("code") or "UNK",
            competition_name=competition.get("name") or "Unknown",
            home_team=home,
            away_team=away,
            kickoff_at=kickoff,
            status=raw.get("status") or "SCHEDULED",
            home_score=full_time.get("home"),
            away_score=full_time.get("away"),
        )
