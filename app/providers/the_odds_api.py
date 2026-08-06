"""
Provider: The Odds API (free tier ~500 requests / month)

Good for: bookmaker odds (1X2 / h2h) from many global books.
Not NG books (SportyBet/Bet9ja) yet — those come later via other sources.
This still teaches the odds table + snapshot pattern for free.

Sign up: https://the-odds-api.com/
Docs:    https://the-odds-api.com/liveapi/guides/v4/

Example:
  GET /v4/sports/soccer_epl/odds?regions=uk,eu&markets=h2h&oddsFormat=decimal&apiKey=KEY
"""

from datetime import datetime, timezone
from decimal import Decimal

import httpx

from app.config import Settings
from app.providers.base import OddQuote


class TheOddsApiError(Exception):
    pass


# Friendly names for sport keys (learning aid)
SPORT_LABELS = {
    "soccer_epl": ("PL", "Premier League"),
    "soccer_spain_la_liga": ("PD", "La Liga"),
    "soccer_italy_serie_a": ("SA", "Serie A"),
    "soccer_germany_bundesliga": ("BL1", "Bundesliga"),
    "soccer_france_ligue_one": ("FL1", "Ligue 1"),
    "soccer_uefa_champs_league": ("CL", "UEFA Champions League"),
}


class TheOddsApiProvider:
    name = "the-odds-api"
    BASE_URL = "https://api.the-odds-api.com/v4"

    def __init__(self, settings: Settings):
        key = (settings.odds_api_key or "").strip()
        if not key or key == "your_odds_api_key_here":
            raise TheOddsApiError(
                "Missing ODDS_API_KEY. "
                "Get a free key at https://the-odds-api.com/ and put it in .env"
            )
        self.settings = settings
        self.api_key = key

    def fetch_h2h_odds(self) -> list[OddQuote]:
        """
        Pull head-to-head (1X2) odds for configured soccer sports.

        Each HTTP call costs 1+ credits on the free plan — keep the sport list short.
        """
        quotes: list[OddQuote] = []
        for sport_key in self.settings.odds_sport_keys_list:
            quotes.extend(self._fetch_sport(sport_key))
        return quotes

    def _fetch_sport(self, sport_key: str) -> list[OddQuote]:
        url = f"{self.BASE_URL}/sports/{sport_key}/odds"
        params = {
            "apiKey": self.api_key,
            "regions": self.settings.odds_regions,
            "markets": "h2h",          # 1X2 style home/draw/away
            "oddsFormat": "decimal",
            "dateFormat": "iso",
        }

        with httpx.Client(timeout=45.0) as client:
            response = client.get(url, headers={}, params=params)

        remaining = response.headers.get("x-requests-remaining")
        used = response.headers.get("x-requests-used")
        print(
            f"[the-odds-api] {response.status_code} {sport_key} "
            f"used={used} remaining={remaining}"
        )

        if response.status_code == 401:
            raise TheOddsApiError("Invalid ODDS_API_KEY")
        if response.status_code == 429:
            raise TheOddsApiError("The Odds API quota exhausted for now (free tier).")
        if response.status_code >= 400:
            raise TheOddsApiError(
                f"The Odds API error {response.status_code}: {response.text[:300]}"
            )

        events = response.json()
        code, name = SPORT_LABELS.get(sport_key, (sport_key, sport_key))
        out: list[OddQuote] = []

        for event in events:
            out.extend(self._event_to_quotes(event, code, name))
        return out

    def _event_to_quotes(self, event: dict, code: str, name: str) -> list[OddQuote]:
        event_id = str(event.get("id"))
        home = event.get("home_team") or "TBD"
        away = event.get("away_team") or "TBD"
        commence = event.get("commence_time")
        kickoff = (
            datetime.fromisoformat(commence.replace("Z", "+00:00"))
            if commence
            else datetime.now(timezone.utc)
        )
        if kickoff.tzinfo is None:
            kickoff = kickoff.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        quotes: list[OddQuote] = []

        for book in event.get("bookmakers") or []:
            bookmaker = (book.get("key") or book.get("title") or "unknown").lower()
            for market in book.get("markets") or []:
                if market.get("key") != "h2h":
                    continue
                for outcome in market.get("outcomes") or []:
                    selection = _selection_from_outcome(outcome.get("name"), home, away)
                    price = outcome.get("price")
                    if selection is None or price is None:
                        continue
                    quotes.append(
                        OddQuote(
                            external_match_id=event_id,
                            provider=self.name,
                            home_team=home,
                            away_team=away,
                            kickoff_at=kickoff,
                            competition_code=code,
                            competition_name=name,
                            bookmaker=bookmaker,
                            market="1X2",
                            selection=selection,
                            price=Decimal(str(price)),
                            captured_at=now,
                        )
                    )
        return quotes


def _selection_from_outcome(name: str | None, home: str, away: str) -> str | None:
    """Map bookmaker outcome labels to home / draw / away."""
    if not name:
        return None
    n = name.strip().lower()
    if n in {"draw", "tie", "x"}:
        return "draw"
    if n == home.strip().lower():
        return "home"
    if n == away.strip().lower():
        return "away"
    # Some books use slightly different team strings — fallback contains check
    if home.strip().lower() in n or n in home.strip().lower():
        return "home"
    if away.strip().lower() in n or n in away.strip().lower():
        return "away"
    return None
