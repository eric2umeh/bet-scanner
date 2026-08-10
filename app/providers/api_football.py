"""
Provider: API-Football / API-Sports (free tier ~100 requests/day)

Good for: fixtures TODAY and TOMORROW across many leagues (live + scheduled).
Sign up (free): https://dashboard.api-football.com/
Docs: https://www.api-football.com/documentation-v3

Auth header: x-apisports-key: YOUR_KEY
Base URL:    https://v3.football.api-sports.io
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

from app.config import Settings
from app.providers.base import FixtureMatch


class ApiFootballError(Exception):
    pass


# Map API-Football league ids → our short codes (expand later as needed)
LEAGUE_CODE_BY_ID = {
    39: ("PL", "Premier League"),
    140: ("PD", "La Liga"),
    135: ("SA", "Serie A"),
    78: ("BL1", "Bundesliga"),
    61: ("FL1", "Ligue 1"),
    2: ("CL", "UEFA Champions League"),
    3: ("EL", "UEFA Europa League"),
}


class ApiFootballProvider:
    """
    Fetches fixtures for local 'today' and 'tomorrow'.

    Why a second provider?
    - football-data.org is great for big leagues / calendars
    - API-Football is better for "what is on now / tomorrow worldwide"
    - Designing both now makes the app scalable later
    """

    name = "api-football"
    BASE_URL = "https://v3.football.api-sports.io"

    def __init__(self, settings: Settings):
        key = (settings.api_football_key or "").strip()
        if not key or key == "your_api_football_key_here":
            raise ApiFootballError(
                "Missing API_FOOTBALL_KEY. "
                "Get a free key at https://dashboard.api-football.com/ "
                "and put it in .env"
            )
        self.settings = settings
        self._headers = {"x-apisports-key": key}

    def fetch_today_and_tomorrow(self) -> list[FixtureMatch]:
        """Two free-tier-friendly calls: one per calendar day in APP_TIMEZONE."""
        tz = ZoneInfo(self.settings.app_timezone)
        today = datetime.now(tz).date()
        tomorrow = today + timedelta(days=1)

        fixtures: list[FixtureMatch] = []
        for day in (today, tomorrow):
            fixtures.extend(self._fetch_for_date(day.isoformat()))
        return fixtures

    def fetch_for_dates(
        self,
        days: list[str],
        *,
        all_leagues: bool = False,
    ) -> list[FixtureMatch]:
        """
        Fetch fixtures for explicit YYYY-MM-DD dates.

        all_leagues=True skips the major-league filter (needed for MLS / USL /
        Liga MX tips that odds-api-io creates).
        """
        fixtures: list[FixtureMatch] = []
        for day in days:
            fixtures.extend(self._fetch_for_date(day, all_leagues=all_leagues))
        return fixtures

    def _fetch_for_date(self, day: str, *, all_leagues: bool = False) -> list[FixtureMatch]:
        """
        GET /fixtures?date=YYYY-MM-DD

        Optional: restrict to major leagues to save noise / quota understanding.
        Set API_FOOTBALL_LEAGUE_IDS in .env (comma-separated), or leave empty for all.
        """
        params: dict[str, str] = {"date": day}
        if self.settings.api_football_league_ids:
            params["league"] = self.settings.api_football_league_ids
            # When filtering by league, API-Football also wants season for some plans;
            # date-only works for free "all fixtures that day" without league filter.

        # If multiple leagues configured as "39-2026,140-2026" style is complex;
        # for learning we either:
        #  - no league filter (all fixtures that day), or
        #  - one league id (simple). Prefer all-day for "now & tomorrow".
        if self.settings.api_football_league_ids and "," in self.settings.api_football_league_ids:
            # Multiple leagues: fetch without league filter, then keep only known ids
            params.pop("league", None)

        if all_leagues:
            params.pop("league", None)

        url = f"{self.BASE_URL}/fixtures"
        with httpx.Client(timeout=45.0) as client:
            response = client.get(url, headers=self._headers, params=params)

        print(
            f"[api-football] {response.status_code} fixtures?date={day} "
            f"remaining={response.headers.get('x-ratelimit-requests-remaining')}"
        )

        if response.status_code == 429:
            raise ApiFootballError("Rate limited by API-Football. Try again tomorrow / later.")
        if response.status_code >= 400:
            raise ApiFootballError(f"API-Football error {response.status_code}: {response.text[:300]}")

        payload = response.json()
        errors = payload.get("errors")
        if errors:
            # API-Football often returns 200 with errors object when key/plan issues
            raise ApiFootballError(f"API-Football errors: {errors}")

        rows = payload.get("response") or []
        allowed = None if all_leagues else self._allowed_league_ids()

        out: list[FixtureMatch] = []
        for row in rows:
            league = row.get("league") or {}
            league_id = league.get("id")
            if allowed is not None and league_id not in allowed:
                continue
            out.append(self._to_fixture(row))
        return out

    def _allowed_league_ids(self) -> set[int] | None:
        raw = (self.settings.api_football_league_ids or "").strip()
        if not raw:
            # None = keep major leagues only by default (less junk for learning)
            return set(LEAGUE_CODE_BY_ID.keys())
        if raw.lower() == "all":
            return None
        return {int(x.strip()) for x in raw.split(",") if x.strip().isdigit()}

    def _to_fixture(self, row: dict) -> FixtureMatch:
        fixture = row.get("fixture") or {}
        league = row.get("league") or {}
        teams = row.get("teams") or {}
        goals = row.get("goals") or {}

        league_id = league.get("id")
        code, name = LEAGUE_CODE_BY_ID.get(
            league_id,
            (str(league_id or "UNK"), league.get("name") or "Unknown"),
        )

        kickoff_raw = fixture.get("date")
        kickoff = datetime.fromisoformat(kickoff_raw.replace("Z", "+00:00")) if kickoff_raw else datetime.now(timezone.utc)
        if kickoff.tzinfo is None:
            kickoff = kickoff.replace(tzinfo=timezone.utc)

        status_short = ((fixture.get("status") or {}).get("short") or "NS").upper()
        status = _map_status(status_short)

        home = ((teams.get("home") or {}).get("name")) or "TBD"
        away = ((teams.get("away") or {}).get("name")) or "TBD"

        return FixtureMatch(
            external_id=str(fixture.get("id")),
            provider=self.name,
            competition_code=code,
            competition_name=name,
            home_team=home,
            away_team=away,
            kickoff_at=kickoff,
            status=status,
            home_score=goals.get("home"),
            away_score=goals.get("away"),
        )


def _map_status(short: str) -> str:
    """Translate API-Football status codes into our shared vocabulary."""
    if short in {"1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"}:
        return "IN_PLAY"
    if short in {"FT", "AET", "PEN"}:
        return "FINISHED"
    if short in {"PST"}:
        return "POSTPONED"
    if short in {"CANC", "ABD"}:
        return "CANCELLED"
    if short in {"NS", "TBD"}:
        return "SCHEDULED"
    return short or "SCHEDULED"
