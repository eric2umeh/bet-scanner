"""
Shared shapes every provider must produce.

Think of these as "our language".
football-data.org, API-Football, The Odds API each speak differently.
We translate them into FixtureMatch / OddQuote, then save those to Postgres.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass
class FixtureMatch:
    """One football match, normalized for our `matches` table."""

    external_id: str          # ID from the provider (string so formats can differ)
    provider: str             # e.g. "football-data", "api-football", "the-odds-api"
    competition_code: str     # short code we choose (PL, PD, ...)
    competition_name: str
    home_team: str
    away_team: str
    kickoff_at: datetime      # always timezone-aware UTC when possible
    status: str               # SCHEDULED | IN_PLAY | FINISHED | ...
    home_score: int | None = None
    away_score: int | None = None


@dataclass
class OddQuote:
    """
    One price for one selection on one match.

    Example:
      bookmaker=bet365, market=1X2, selection=home, price=1.90
    """

    # Used to find / create the related Match row
    external_match_id: str
    provider: str
    home_team: str
    away_team: str
    kickoff_at: datetime
    competition_code: str
    competition_name: str

    bookmaker: str
    market: str       # e.g. "1X2"
    selection: str    # e.g. "home" | "draw" | "away"
    price: Decimal
    captured_at: datetime | None = None