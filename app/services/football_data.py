"""
Client for football-data.org v4 (free tier is enough to learn).

Docs:
- Quickstart: https://www.football-data.org/documentation/quickstart
- Reference: https://docs.football-data.org/general/v4/index.html
- Python sample: https://docs.football-data.org/general/v4/coding/python.html
- Headers / throttling: https://docs.football-data.org/general/v4/lookup_tables.html#_response_headers

Auth: send header X-Auth-Token (not a query param).
"""

from datetime import date
import time

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
        Fetch matches for one competition between two dates.

        Important (v4): dateTo is EXCLUSIVE — matches on dateTo itself are not included.
        So to include "tomorrow", pass date_to = day-after-tomorrow.
        """
        url = f"{self.BASE_URL}/competitions/{competition_code}/matches"
        params = {
            "dateFrom": date_from.isoformat(),
            "dateTo": date_to.isoformat(),
        }

        response = self._get(url, params=params)
        payload = response.json()
        return payload.get("matches", [])

    def _get(self, url: str, params: dict | None = None) -> httpx.Response:
        """
        GET with automatic respect for free-tier throttling headers:
        - X-RequestsAvailable: remaining calls in the current window
        - X-RequestCounter-Reset: seconds until the counter resets
        """
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, headers=self._headers, params=params)

        available = response.headers.get("X-RequestsAvailable")
        reset_in = response.headers.get("X-RequestCounter-Reset")
        client_name = response.headers.get("X-Authenticated-Client", "unknown")
        print(
            f"[football-data] {response.status_code} {url} "
            f"client={client_name} remaining={available} reset_in={reset_in}s"
        )

        if response.status_code == 429:
            wait_s = int(reset_in) if reset_in and reset_in.isdigit() else 60
            raise FootballDataError(
                f"Rate limited by football-data.org. Wait ~{wait_s}s and try again."
            )
        if response.status_code >= 400:
            raise FootballDataError(
                f"football-data.org error {response.status_code}: {response.text}"
            )

        # Stay polite on free tier: if few requests left, pause briefly
        if available is not None and available.isdigit() and int(available) <= 2:
            wait_s = int(reset_in) if reset_in and reset_in.isdigit() else 30
            print(f"[football-data] low quota — sleeping {wait_s}s")
            time.sleep(wait_s)

        return response
