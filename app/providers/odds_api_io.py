"""
Provider: Odds-API.io (FREE tier — recommended for Phase 3B)

Why this instead of paying BetRelay right now?
- Free forever: ~100 req/hour, 500/day, no card required
- Pick 2 recreational books — use SportyBet + Bet9ja for Nigeria arbs
- Docs: https://docs.odds-api.io/quickstart
- Sign up: https://odds-api.io

Auth: ?apiKey=YOUR_KEY on query string
Flow:
  1) GET /v3/events?sport=football&limit=N
  2) GET /v3/odds?eventId=...&bookmakers=SportyBet,Bet9ja
"""

from datetime import datetime, timezone
from decimal import Decimal
import time

import httpx

from app.config import Settings
from app.providers.base import OddQuote


class OddsApiIoError(Exception):
    pass


# Map league slug snippets → our short codes (best-effort)
LEAGUE_CODE_HINTS = (
    ("premier-league", "PL", "Premier League"),
    ("la-liga", "PD", "La Liga"),
    ("serie-a", "SA", "Serie A"),
    ("bundesliga", "BL1", "Bundesliga"),
    ("ligue-1", "FL1", "Ligue 1"),
    ("champions-league", "CL", "UEFA Champions League"),
    ("europa-league", "EL", "UEFA Europa League"),
)


class OddsApiIoProvider:
    """Pull SportyBet / Bet9ja (etc.) 1X2 odds into OddQuote rows."""

    name = "odds-api-io"
    BASE_URL = "https://api.odds-api.io/v3"

    def __init__(self, settings: Settings):
        key = (settings.odds_api_io_key or "").strip()
        if not key or key == "your_odds_api_io_key_here":
            raise OddsApiIoError(
                "Missing ODDS_API_IO_KEY. "
                "Get a FREE key at https://odds-api.io (no card) and put it in .env. "
                "In the dashboard, select SportyBet + Bet9ja as your 2 free books."
            )
        self.settings = settings
        self.api_key = key
        self.bookmakers = settings.odds_api_io_bookmakers_list
        self.event_limit = max(1, min(settings.odds_api_io_event_limit, 40))

    def fetch_h2h_odds(self) -> list[OddQuote]:
        """
        Fetch a small batch of football events, then 1X2 (ML) odds
        from configured NG books.

        Request budget tip:
          1 events call + N odds calls. Keep event_limit low while learning.
        """
        events = self._list_events()
        quotes: list[OddQuote] = []
        for event in events[: self.event_limit]:
            event_id = event.get("id")
            if event_id is None:
                continue
            try:
                payload = self._get_event_odds(event_id)
            except OddsApiIoError as exc:
                print(f"[odds-api-io] skip event {event_id}: {exc}")
                continue
            quotes.extend(self._payload_to_quotes(payload, event))
            # Be gentle on free hourly quota
            time.sleep(0.35)
        return quotes

    def _list_events(self) -> list[dict]:
        params = {
            "apiKey": self.api_key,
            "sport": "football",
            "status": "pending,live",
            "limit": self.event_limit,
        }
        # Prefer events that actually have one of our NG books
        if self.bookmakers:
            params["bookmaker"] = self.bookmakers[0]

        data = self._get("/events", params)
        if not isinstance(data, list):
            raise OddsApiIoError(f"Unexpected /events response: {type(data)}")
        print(f"[odds-api-io] events={len(data)} (limit={self.event_limit})")
        return data

    def _get_event_odds(self, event_id: int | str) -> dict:
        params = {
            "apiKey": self.api_key,
            "eventId": str(event_id),
            "bookmakers": ",".join(self.bookmakers),
        }
        data = self._get("/odds", params)
        if not isinstance(data, dict):
            raise OddsApiIoError(f"Unexpected /odds response for {event_id}")
        return data

    def _get(self, path: str, params: dict) -> object:
        url = f"{self.BASE_URL}{path}"
        with httpx.Client(timeout=45.0) as client:
            response = client.get(url, params=params)

        print(f"[odds-api-io] {response.status_code} {path}")
        if response.status_code == 401:
            raise OddsApiIoError("Invalid ODDS_API_IO_KEY")
        if response.status_code == 403:
            raise OddsApiIoError(
                "Forbidden — check that SportyBet/Bet9ja are enabled on your free plan "
                "(only 2 recreational books allowed)."
            )
        if response.status_code == 429:
            raise OddsApiIoError("Rate limited by odds-api.io. Wait and retry.")
        if response.status_code >= 400:
            raise OddsApiIoError(
                f"odds-api.io error {response.status_code}: {response.text[:300]}"
            )
        return response.json()

    def _payload_to_quotes(self, payload: dict, event_fallback: dict) -> list[OddQuote]:
        home = payload.get("home") or event_fallback.get("home") or "TBD"
        away = payload.get("away") or event_fallback.get("away") or "TBD"
        event_id = str(payload.get("id") or event_fallback.get("id"))
        league = event_fallback.get("league") or {}
        code, name = _league_code(league.get("slug"), league.get("name"))

        kickoff_raw = payload.get("date") or event_fallback.get("date")
        kickoff = _parse_dt(kickoff_raw)
        now = datetime.now(timezone.utc)
        bookmakers = payload.get("bookmakers") or {}

        out: list[OddQuote] = []
        for book_name, markets in bookmakers.items():
            book_key = _normalize_book(book_name)
            if not isinstance(markets, list):
                continue
            ml = next((m for m in markets if str(m.get("name", "")).upper() in {"ML", "1X2", "MATCH"}), None)
            if not ml:
                continue
            odds_rows = ml.get("odds") or []
            if not odds_rows:
                continue
            row = odds_rows[0]
            for selection, raw_price in (
                ("home", row.get("home")),
                ("draw", row.get("draw")),
                ("away", row.get("away")),
            ):
                if raw_price is None:
                    continue
                try:
                    price = Decimal(str(raw_price))
                except Exception:
                    continue
                if price <= 1:
                    continue
                out.append(
                    OddQuote(
                        external_match_id=event_id,
                        provider=self.name,
                        home_team=home,
                        away_team=away,
                        kickoff_at=kickoff,
                        competition_code=code,
                        competition_name=name,
                        bookmaker=book_key,
                        market="1X2",
                        selection=selection,
                        price=price,
                        captured_at=now,
                    )
                )
        return out


def _normalize_book(name: str) -> str:
    """SportyBet → sportybet (matches our arb / glossary style)."""
    return name.strip().lower().replace(" ", "")


def _league_code(slug: str | None, name: str | None) -> tuple[str, str]:
    s = (slug or "").lower()
    for hint, code, label in LEAGUE_CODE_HINTS:
        if hint in s:
            return code, label
    return "UNK", name or slug or "Unknown"


def _parse_dt(raw: str | None) -> datetime:
    if not raw:
        return datetime.now(timezone.utc)
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt
