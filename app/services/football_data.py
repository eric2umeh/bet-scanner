"""
Client for football-data.org (free tier is enough to learn).

Docs: https://www.football-data.org/documentation/quickstart
Register: https://www.football-data.org/client/register

Free-tier tip: be gentle with request rate (don't spam their API).
"""

from datetime import date

import httpx

from app.config import Settings


class FootballDataError(Exception):
    pass


class FootballDataClient:
    BASE_URL = "https://api.football-data.org/v4"

    def __init__(self, settings: Settings):
        if not settings.football_data_api_key or settings.football_data_api_key == "your_token_here":
            raise FootballDataError(
                "Missing FOOTBALL_DATA_API_KEY. "
                "Copy .env.example → .env and paste your free token from football-data.org"
            )
        self._headers = {"X-Auth-Token": settings.football_data_api_key}

    def get_matches_for_competition(
        self,
        competition_code: str,
        date_from: date,
        date_to: date,
    ) -> list[dict]:
        """
        Fetch matches for one competition between two dates (inclusive).

        Example competition codes: PL, PD, SA, BL1, FL1, CL
        """
        url = f"{self.BASE_URL}/competitions/{competition_code}/matches"
        params = {
            "dateFrom": date_from.isoformat(),
            "dateTo": date_to.isoformat(),
        }

        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, headers=self._headers, params=params)

        if response.status_code == 429:
            raise FootballDataError(
                "Rate limited by football-data.org. Wait a minute and try again."
            )
        if response.status_code >= 400:
            raise FootballDataError(
                f"football-data.org error {response.status_code}: {response.text}"
            )

        payload = response.json()
        return payload.get("matches", [])