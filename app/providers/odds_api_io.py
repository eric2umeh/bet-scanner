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

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import re
import time

import httpx

from app.config import Settings
from app.providers.base import FixtureMatch, OddQuote
from app.services.bookmakers import api_book_query_name, normalize_book_key
from app.services.match_status import normalize_match_status
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
ODDS_MARKETS = "ML,Totals,Both Teams To Score,Double Chance,Team Totals"
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
        # Cap 100: keeps free-tier /odds/multi usage reasonable (~10 batches).
        self.event_limit = max(1, min(settings.odds_api_io_event_limit, 100))

    def fetch_settled_fixtures(
        self,
        from_dt: datetime,
        to_dt: datetime,
    ) -> list[FixtureMatch]:
        """
        Finished + cancelled football events (scores + status for auto-settle).

        One request: GET /events?status=settled
        """
        params = {
            "apiKey": self.api_key,
            "sport": "football",
            "status": "settled",
            "from": _format_rfc3339(from_dt),
            "to": _format_rfc3339(to_dt),
            "limit": 5000,
        }
        data = self._get("/events", params)
        if not isinstance(data, list):
            raise OddsApiIoError(f"Unexpected /events result response: {type(data)}")

        out: list[FixtureMatch] = []
        for event in data:
            if not isinstance(event, dict):
                continue
            fx = _event_to_fixture(event)
            if fx is not None:
                out.append(fx)
        print(f"[odds-api-io] result events={len(out)}/{len(data)}")
        return out

    def search_settled_fixture(
        self,
        home_team: str,
        away_team: str,
        kickoff_at: datetime,
    ) -> FixtureMatch | None:
        """
        Find one finished match by team name when bulk /events missed it.

        GET /historical/events/search — up to ~31-day window around kickoff.
        """
        ko = kickoff_at
        if ko.tzinfo is None:
            ko = ko.replace(tzinfo=timezone.utc)
        else:
            ko = ko.astimezone(timezone.utc)
        window_from = ko - timedelta(hours=18)
        window_to = ko + timedelta(hours=18)

        query = (home_team or away_team or "").strip()
        if len(query) < 3:
            return None

        # Prefer the strongest team token ("Apollon L." → "Apollon") for search
        tokens = [t for t in re.sub(r"[^\w\s]", " ", query).split() if len(t) >= 3]
        search_queries = [query[:80]]
        if tokens and tokens[0].lower() not in query[:80].lower():
            search_queries.insert(0, tokens[0])
        elif tokens and tokens[0] != query:
            search_queries.append(tokens[0])

        best: FixtureMatch | None = None
        best_pair = 0.0
        for qtext in search_queries:
            params = {
                "apiKey": self.api_key,
                "query": qtext[:80],
                "sport": "football",
                "from": _format_rfc3339(window_from),
                "to": _format_rfc3339(window_to),
            }
            data = self._get("/historical/events/search", params)
            if not isinstance(data, list):
                continue

            for event in data:
                if not isinstance(event, dict):
                    continue
                fx = _event_to_fixture(event)
                if fx is None:
                    continue
                direct = (
                    _team_name_score(home_team, fx.home_team)
                    + _team_name_score(away_team, fx.away_team)
                ) / 2
                swapped = (
                    _team_name_score(home_team, fx.away_team)
                    + _team_name_score(away_team, fx.home_team)
                ) / 2
                pair = max(direct, swapped)
                if pair < 0.72:
                    continue
                fx_ko = fx.kickoff_at
                if fx_ko.tzinfo is None:
                    fx_ko = fx_ko.replace(tzinfo=timezone.utc)
                hours = abs((ko - fx_ko.astimezone(timezone.utc)).total_seconds()) / 3600.0
                if hours > 18:
                    continue
                if pair > best_pair:
                    best_pair = pair
                    best = fx
            if best is not None and best_pair >= 0.9:
                break
        return best

    def fetch_pending_fixtures(self) -> list[FixtureMatch]:
        """
        Pending football events from odds-api.io (configured NG books).

        Same list used before /odds/multi — keeps Today in sync with bookmaker coverage.
        """
        events = self._list_events()
        out: list[FixtureMatch] = []
        for event in events:
            fx = _pending_event_to_fixture(event)
            if fx is not None:
                out.append(fx)
        print(f"[odds-api-io] pending fixtures={len(out)}/{len(events)}")
        return out

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
        List pending football events per configured book, keep kickoff > now,
        prefer the next few days, then round-robin merge with hard cap = event_limit.
        """
        status = "pending"
        now = datetime.now(timezone.utc)
        # Prefer near-term fixtures so the daily card isn't filled with far-away games.
        days_ahead = max(1, min(int(getattr(self.settings, "sync_days_ahead", 7) or 7), 14))
        window_to = now + timedelta(days=days_ahead)
        range_params = {
            "from": _format_rfc3339(now - timedelta(minutes=5)),
            "to": _format_rfc3339(window_to),
        }

        if not self.bookmakers:
            data = self._get(
                "/events",
                {
                    "apiKey": self.api_key,
                    "sport": "football",
                    "status": status,
                    "limit": self.event_limit,
                    **range_params,
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

        # Ask each book for up to event_limit events, then merge uniquely.
        per_book: list[list[dict]] = []
        for book in self.bookmakers:
            api_book = api_book_query_name(book)
            data = self._get(
                "/events",
                {
                    "apiKey": self.api_key,
                    "sport": "football",
                    "status": status,
                    "limit": self.event_limit,
                    "bookmaker": api_book,
                    **range_params,
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
        books = self.bookmakers or []
        if not books:
            return self._get_multi_odds_for_books(event_ids, [])

        try:
            return self._get_multi_odds_for_books(event_ids, books)
        except OddsApiIoError as exc:
            msg = str(exc).lower()
            if len(books) <= 1:
                raise
            # Invalid or forbidden book in a pair — try each book alone (e.g. BetKing on plan).
            merged: list[dict] = []
            for book in books:
                try:
                    merged.extend(self._get_multi_odds_for_books(event_ids, [book]))
                except OddsApiIoError as book_exc:
                    print(f"[odds-api-io] skip book {book}: {book_exc}")
            if merged:
                return _dedupe_event_payloads(merged)
            raise exc

    def _get_multi_odds_for_books(self, event_ids: list[str], books: list[str]) -> list[dict]:
        params = {
            "apiKey": self.api_key,
            "eventIds": ",".join(event_ids),
            "markets": ODDS_MARKETS,
        }
        if books:
            params["bookmakers"] = ",".join(api_book_query_name(b) for b in books)
        data = self._get("/odds/multi", params)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
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
        # Keep common recreational lines: 0.5 / 1.5 / 2.5 (higher hit-rate focus on 0.5 & 1.5).
        wanted_lines = {0.5: "ou_0_5", 1.5: "ou_1_5", 2.5: "ou_2_5"}
        found: dict[float, dict] = {}
        for row in odds_rows:
            line = row.get("max")
            if line is None:
                line = row.get("hdp")
            try:
                line_f = float(line) if line is not None else None
            except (TypeError, ValueError):
                continue
            if line_f is None:
                continue
            for target, _market in wanted_lines.items():
                if abs(line_f - target) < 0.01 and target not in found:
                    found[target] = row
        for target, market_key in wanted_lines.items():
            row = found.get(target)
            if not row:
                continue
            add(market_key, "over", row.get("over"))
            add(market_key, "under", row.get("under"))
        return out

    if key in {"team totals", "team total", "teamtotals"}:
        # Team over 2.5 goals ≈ that side scores 3+.
        for row in odds_rows:
            line = row.get("max")
            if line is None:
                line = row.get("hdp")
            try:
                if line is None or abs(float(line) - 2.5) > 0.01:
                    continue
            except (TypeError, ValueError):
                continue
            side = str(row.get("team") or row.get("side") or row.get("name") or "").lower()
            if side in {"home", "1", "h"}:
                add("tt_2_5", "home_over", row.get("over"))
                add("tt_2_5", "home_under", row.get("under"))
            elif side in {"away", "2", "a"}:
                add("tt_2_5", "away_over", row.get("over"))
                add("tt_2_5", "away_under", row.get("under"))
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
    """SportyBet → sportybet; 1xBet → onexbet."""
    return normalize_book_key(name)


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


def _dedupe_event_payloads(payloads: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for payload in payloads:
        if not isinstance(payload, dict):
            continue
        eid = str(payload.get("id") or "")
        if not eid or eid in seen:
            continue
        seen.add(eid)
        out.append(payload)
    return out


def _pending_event_to_fixture(event: dict) -> FixtureMatch | None:
    """Map pending odds-api.io event → SCHEDULED FixtureMatch."""
    event_id = event.get("id")
    if event_id is None:
        return None
    league = event.get("league") or {}
    if not isinstance(league, dict):
        league = {}
    code, name = _league_code(league.get("slug"), league.get("name"))
    return FixtureMatch(
        external_id=str(event_id),
        provider="odds-api-io",
        competition_code=code,
        competition_name=name,
        home_team=str(event.get("home") or "TBD"),
        away_team=str(event.get("away") or "TBD"),
        kickoff_at=_parse_dt(event.get("date")),
        status="SCHEDULED",
    )


def _future_events_only(events: list[dict]) -> list[dict]:
    """Drop kickoffs already started before we spend /odds quota on them."""
    out: list[dict] = []
    for event in events:
        if _is_future_kickoff(_parse_dt(event.get("date"))):
            out.append(event)
    return out


def _format_rfc3339(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _team_name_score(a: str, b: str) -> float:
    al, bl = (a or "").lower().strip(), (b or "").lower().strip()
    if not al or not bl:
        return 0.0
    if al == bl:
        return 1.0
    if al in bl or bl in al:
        return 0.92
    # Token overlap without 1-char initials ("Apollon L." ↔ "Apollon Limassol")
    def tokens(s: str) -> set[str]:
        parts = re.sub(r"[^\w\s]", " ", s).split()
        return {t for t in parts if len(t) >= 2}

    ta, tb = tokens(al), tokens(bl)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    if inter == 0:
        for x in ta:
            if any(y.startswith(x) or x.startswith(y) for y in tb if min(len(x), len(y)) >= 4):
                return 0.85
        return 0.0
    return inter / min(len(ta), len(tb))


def _event_to_fixture(event: dict) -> FixtureMatch | None:
    """Map odds-api.io event JSON → FixtureMatch (finished or voidable)."""
    raw_status = event.get("status") or ""
    status = normalize_match_status(str(raw_status))
    scores = event.get("scores") or {}
    home_score = scores.get("home")
    away_score = scores.get("away")
    home_i: int | None = None
    away_i: int | None = None
    if home_score is not None and away_score is not None:
        try:
            home_i = int(home_score)
            away_i = int(away_score)
        except (TypeError, ValueError):
            home_i = away_i = None

    if status == "FINISHED" and (home_i is None or away_i is None):
        return None
    if status not in {"FINISHED", "POSTPONED", "CANCELLED", "SUSPENDED"}:
        return None

    league = event.get("league") or {}
    if not isinstance(league, dict):
        league = {}
    code, name = _league_code(league.get("slug"), league.get("name"))
    event_id = event.get("id")
    if event_id is None:
        return None

    return FixtureMatch(
        external_id=str(event_id),
        provider="odds-api-io",
        competition_code=code,
        competition_name=name,
        home_team=str(event.get("home") or "TBD"),
        away_team=str(event.get("away") or "TBD"),
        kickoff_at=_parse_dt(event.get("date")),
        status=status,
        home_score=home_i,
        away_score=away_i,
    )
