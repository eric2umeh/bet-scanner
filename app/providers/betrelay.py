"""
Provider: BetRelay (OPTIONAL — paid / test key)

BetRelay is excellent for Nigeria (SportyBet, Bet9ja, BetKing, 1xBet, …)
and code conversion, but a live API key usually needs a paid plan.
Docs: https://betrelay.com.ng/api-docs

Free path for Phase 3B = odds-api.io (see odds_api_io.py).
Use BetRelay later when you upgrade, or if you get a free/test key.

Strategy when enabled:
  For each upcoming match already in OUR database, call:
    GET /api/v1/odds?home=...&away=...
  and store 1X2 prices per Nigerian bookmaker.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import time

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Match
from app.providers.base import OddQuote


class BetRelayError(Exception):
    pass


SELECTION_MAP = {
    "home": "home",
    "1": "home",
    "draw": "draw",
    "x": "draw",
    "away": "away",
    "2": "away",
}


class BetRelayProvider:
    name = "betrelay"
    BASE_URL = "https://betrelay.com.ng/api/v1"

    def __init__(self, settings: Settings):
        key = (settings.betrelay_api_key or "").strip()
        if not key or key.startswith("your_"):
            raise BetRelayError(
                "Missing BETRELAY_API_KEY. "
                "BetRelay live keys are usually paid — see https://betrelay.com.ng/api-docs. "
                "For free NG odds now, use ODDS_API_IO_KEY instead."
            )
        self.settings = settings
        self.api_key = key
        self.match_limit = max(1, min(settings.betrelay_match_limit, 30))

    def fetch_h2h_odds(self, db: Session) -> list[OddQuote]:
        """Pull NG book 1X2 odds for upcoming matches already in our DB."""
        now = datetime.now(timezone.utc)
        end = now + timedelta(days=14)
        matches = list(
            db.scalars(
                select(Match)
                .where(Match.kickoff_at >= now, Match.kickoff_at < end)
                .order_by(Match.kickoff_at.asc())
                .limit(self.match_limit)
            )
        )
        if not matches:
            print("[betrelay] no upcoming matches in DB — run /matches/sync first")
            return []

        quotes: list[OddQuote] = []
        for match in matches:
            try:
                quotes.extend(self._odds_for_match(match))
            except BetRelayError as exc:
                print(f"[betrelay] skip {match.home_team} vs {match.away_team}: {exc}")
            time.sleep(0.4)
        return quotes

    def _odds_for_match(self, match: Match) -> list[OddQuote]:
        params = {
            "home": match.home_team,
            "away": match.away_team,
            "competition": match.competition_name,
        }
        with httpx.Client(timeout=45.0) as client:
            response = client.get(
                f"{self.BASE_URL}/odds",
                params=params,
                headers={"X-API-Key": self.api_key},
            )

        print(
            f"[betrelay] {response.status_code} odds "
            f"{match.home_team} vs {match.away_team} "
            f"daily_left={response.headers.get('X-RateLimit-Daily-Remaining')}"
        )
        if response.status_code == 401:
            raise BetRelayError("Invalid BETRELAY_API_KEY")
        if response.status_code == 429:
            raise BetRelayError("BetRelay rate limit exceeded")
        if response.status_code >= 400:
            raise BetRelayError(f"{response.status_code}: {response.text[:250]}")

        payload = response.json()
        data = payload.get("data") or {}
        markets = data.get("markets") or []
        now = datetime.now(timezone.utc)
        out: list[OddQuote] = []

        for market in markets:
            if str(market.get("name", "")).upper().replace(" ", "") not in {
                "1X2",
                "MATCHRESULT",
                "MATCH_RESULT",
            }:
                continue
            for outcome in market.get("outcomes") or []:
                sel = SELECTION_MAP.get(str(outcome.get("name", "")).strip().lower())
                if not sel:
                    continue
                prices = outcome.get("odds") or {}
                for book, price in prices.items():
                    if price is None:
                        continue
                    try:
                        dec = Decimal(str(price))
                    except Exception:
                        continue
                    if dec <= 1:
                        continue
                    out.append(
                        OddQuote(
                            external_match_id=f"db-{match.id}",
                            provider=self.name,
                            home_team=match.home_team,
                            away_team=match.away_team,
                            kickoff_at=match.kickoff_at,
                            competition_code=match.competition_code,
                            competition_name=match.competition_name,
                            bookmaker=str(book).strip().lower(),
                            market="1X2",
                            selection=sel,
                            price=dec,
                            captured_at=now,
                            # Attach to the existing row so arb can mix books on one match
                            existing_match_id=match.id,
                        )
                    )
        return out
