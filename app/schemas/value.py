"""JSON shapes for Phase 5 value / EV scan."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ValuePickOut(BaseModel):
    match_id: int
    home_team: str
    away_team: str
    competition_code: str
    kickoff_at: datetime | None = None
    market: str = "1X2"
    selection: str
    bookmaker: str
    odds: Decimal
    fair_odds: Decimal
    fair_prob: Decimal
    ev_pct: Decimal
    kelly_fraction: Decimal
    suggested_stake_ngn: Decimal
    potential_return_ngn: Decimal
    profile: str = "value_cross_book"
    pick_market: str = "1x2"
    books_used: list[str] = []
    age_minutes: float | None = None
    rationale: str | None = None
    warning: str | None = None


class ValueScanResponse(BaseModel):
    count: int
    min_ev_pct: Decimal
    max_odds_age_minutes: int
    bankroll_ngn: Decimal
    unit_pct: Decimal
    one_unit_ngn: Decimal
    picks: list[ValuePickOut]
    message: str


class ValueEvaluateRequest(BaseModel):
    """Paste 1X2 prices from 2+ books to see EV (learning /docs)."""

    books: dict[str, dict[str, Decimal]] = Field(
        ...,
        description='e.g. {"sportybet": {"home": 2.1, "draw": 3.4, "away": 3.5}, ...}',
    )
    min_ev_pct: Decimal = Field(default=Decimal("1.5"), ge=0)


class ValueEvaluateResponse(BaseModel):
    fair_probs: dict[str, Decimal]
    fair_odds: dict[str, Decimal]
    picks: list[dict]
    message: str
