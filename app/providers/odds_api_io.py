"""
Provider: Odds-API.io (FREE tier — recommended for Phase 3B / 10B)

Why this instead of paying BetRelay right now?
- Free forever: ~100 req/hour, 500/day, no card required
- Pick 2 recreational books — use SportyBet + Bet9ja for Nigeria arbs
- Docs: https://odds-api.io/docs
- Sign up: https://odds-api.io

Auth: ?apiKey=YOUR_KEY on query string
Flow:
  1) GET /v3/events?sport=football&status=pending&limit=N  (per book)
  2) GET /v3/odds/multi?eventIds=...&bookmakers=...&markets=...
     (/multi = 1 request for up to 10 events — saves free quota)
"""

from datetime import datetime, timezone
from decimal import Decimal
import time

import httpx

from app.config import Settings
from app.providers.base import OddQuote
from app.services.ng_market_filters import market_block_is_active, selection_price_active


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

# One /odds call returns all of these (no extra request cost)
ODDS_MARKETS = "ML,Totals,Both Teams To Score,Double Chance"
MULTI_BATCH = 10


class OddsApiIoProvider:
    """Pull SportyBet / Bet9ja (etc.) odds into OddQuote rows."""

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
        Fetch future events, then odds via /odds/multi (quota-friendly).

        Markets on each payload: 1X2 (ML), O/U Totals, BTTS, Double Chance.
        """
        events = self._list_events()
        quotes: list[OddQuote] = []
        for i in range(0, len(events), MULTI_BATCH):
            batch = events[i : i + MULTI_BATCH]
            by_id = {str(e.get("id")): e for e in batch if e.get("id") is not None}
            if not by_id:
                continue
            try:
                payloads = self._get_multi_odds(list(by_id.keys()))
            except OddsApiIoError as exc:
                print(f"[odds-api-io] multi batch skip: {exc}")
                continue
            for payload in payloads:
                if not isinstance(payload, dict):
                    continue
                eid = str(payload.get("id") or "")
                quotes.extend(self._payload_to_quotes(payload, by_id.get(eid, {})))
            time.sleep(0.25)

        by_book: dict[str, int] = {}
        by_market: dict[str, int] = {}
        for q in quotes:
            by_book[q.bookmaker] = by_book.get(q.bookmaker, 0) + 1
            by_market[q.market] = by_market.get(q.market, 0) + 1
        print(
            f"[odds-api-io] quotes={len(quotes)} by_book={by_book} "
            f"by_market={by_market} events={len(events)}"
        )
        return quotes

    def _list_events(self) -> list[dict]:
        """
        List pending football events per NG book, keep kickoff > now,
        then round-robin merge with hard cap = event_limit.
        """
        status = "pending"

        if not self.bookmakers:
            data = self._get(
                "/events",
                {
                    "apiKey": self.api_key,
                    "sport": "football",
                    "status": status,
                    "limit": self.event_limit,
                },
            )
            if not isinstance(data, list):
                raise OddsApiIoError(f"Unexpected /events response: {type(data)}")
            future = _future_events_only(data)
            print(
                f"[odds-api-io] events={len(future)}/{len(data)} future "
                f"(limit={self.event_limit})"
            )
            return future[: self.event_limit]

        per_book: list[list[dict]] = []
        for book in self.bookmakers:
            data = self._get(
                "/events",
                {
                    "apiKey": self.api_key,
                    "sport": "football",
                    "status": status,
                    "limit": self.event_limit,
                    "bookmaker": book,
                },
            )
            if not isinstance(data, list):
                raise OddsApiIoError(
                    f"Unexpected /events response for {book}: {type(data)}"
                )
            future = _future_events_only(data)
            print(
                f"[odds-api-io] events={len(future)}/{len(data)} future "
                f"bookmaker={book}"
            )
            per_book.append(future)

        cap = self.event_limit
        selected: list[dict] = []
        seen: set = set()
        index = 0
        while len(selected) < cap:
            progressed = False
            for events in per_book:
                if index >= len(events):
                    continue
                event = events[index]
                event_id = event.get("id")
                progressed = True
                if event_id is None or event_id in seen:
                    continue
                seen.add(event_id)
                selected.append(event)
                if len(selected) >= cap:
                    break
            if not progressed:
                break
            index += 1

        print(
            f"[odds-api-io] events={len(selected)} future "
            f"(merged from {len(self.bookmakers)} books, cap={cap})"
        )
        return selected

    def _get_multi_odds(self, event_ids: list[str]) -> list[dict]:
        """One request for up to 10 events (counts as 1 against free quota)."""
        params = {
            "apiKey": self.api_key,
            "eventIds": ",".join(event_ids),
            "bookmakers": ",".join(self.bookmakers),
            "markets": ODDS_MARKETS,
        }
        data = self._get("/odds/multi", params)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # Some gateways wrap a single event
            return [data]
        raise OddsApiIoError(f"Unexpected /odds/multi response: {type(data)}")

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
        league = event_fallback.get("league") or payload.get("league") or {}
        if not isinstance(league, dict):
            league = {}
        code, name = _league_code(league.get("slug"), league.get("name"))

        kickoff_raw = payload.get("date") or event_fallback.get("date")
        kickoff = _parse_dt(kickoff_raw)
        if not _is_future_kickoff(kickoff):
            return []
        now = datetime.now(timezone.utc)
        bookmakers = payload.get("bookmakers") or {}
        league_name = league.get("name") if isinstance(league, dict) else None

        out: list[OddQuote] = []
        for book_name, markets in bookmakers.items():
            book_key = _normalize_book(book_name)
            if not isinstance(markets, list):
                continue
            for market in markets:
                if not isinstance(market, dict):
                    continue
                if not market_block_is_active(market):
                    continue
                mname = str(market.get("name") or "").strip()
                odds_rows = market.get("odds") or []
                if not odds_rows:
                    continue
                out.extend(
                    _quotes_for_market(
                        market_name=mname,
                        odds_rows=odds_rows,
                        base=dict(
                            external_match_id=event_id,
                            provider=self.name,
                            home_team=home,
                            away_team=away,
                            kickoff_at=kickoff,
                            competition_code=code,
                            competition_name=name or league_name or code,
                            bookmaker=book_key,
                            captured_at=now,
                        ),
                    )
                )
        return out


def _quotes_for_market(*, market_name: str, odds_rows: list, base: dict) -> list[OddQuote]:
    """Translate one odds-api.io market block into OddQuote rows."""
    key = market_name.lower()
    out: list[OddQuote] = []

    def add(market: str, selection: str, raw_price) -> None:
        if not selection_price_active(raw_price):
            return
        price = _dec(raw_price)
        if price is None or price <= 1:
            return
        out.append(
            OddQuote(
                **base,
                market=market,
                selection=selection,
                price=price,
            )
        )

    if key in {"ml", "1x2", "match"}:
        row = odds_rows[0] if odds_rows else {}
        add("1X2", "home", row.get("home"))
        add("1X2", "draw", row.get("draw"))
        add("1X2", "away", row.get("away"))
        return out

    if key in {"double chance", "doublechance", "dc"}:
        row = odds_rows[0] if odds_rows else {}
        add("double_chance", "1X", row.get("1X") or row.get("1x"))
        add("double_chance", "12", row.get("12"))
        add("double_chance", "X2", row.get("X2") or row.get("x2"))
        return out

    if key in {"both teams to score", "btts", "both teams score"}:
        row = odds_rows[0] if odds_rows else {}
        add("btts", "yes", row.get("yes") or row.get("Yes"))
        add("btts", "no", row.get("no") or row.get("No"))
        return out

    if key in {"totals", "goals over/under", "over/under"}:
        # Prefer the main 2.5 line (most used NG market)
        row_25 = None
        for row in odds_rows:
            line = row.get("max")
            if line is None:
                line = row.get("hdp")
            try:
                if line is not None and abs(float(line) - 2.5) < 0.01:
                    row_25 = row
                    break
            except (TypeError, ValueError):
                continue
        if row_25 is None and odds_rows:
            # Fallback: first totals row if books only offer one line
            row_25 = odds_rows[0]
            line = row_25.get("max", row_25.get("hdp"))
            try:
                if line is not None and abs(float(line) - 2.5) > 0.01:
                    return out
            except (TypeError, ValueError):
                return out
        if row_25:
            add("ou_2_5", "over", row_25.get("over"))
            add("ou_2_5", "under", row_25.get("under"))
        return out

    return out


def _dec(raw) -> Decimal | None:
    if raw is None:
        return None
    try:
        return Decimal(str(raw))
    except Exception:
        return None


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


def _is_future_kickoff(kickoff: datetime, *, grace_seconds: int = 60) -> bool:
    """
    True if kickoff is still ahead of the current UTC clock.

    Not a fixed hour — at 7:00am you keep 10am/3pm/7pm;
    you only drop games that already kicked off before 7:00am.
    """
    now = datetime.now(timezone.utc)
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)
    return kickoff.timestamp() > now.timestamp() - grace_seconds


def _future_events_only(events: list[dict]) -> list[dict]:
    """Drop kickoffs already started before we spend /odds quota on them."""
    out: list[dict] = []
    for event in events:
        if _is_future_kickoff(_parse_dt(event.get("date"))):
            out.append(event)
    return out
