"""JSON shapes for Phase 10B goal-market predictions (O/U 2.5, BTTS)."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class GoalMarketPickOut(BaseModel):
    match_id: int | None = None
    home_team: str | None = None
    away_team: str | None = None
    competition_code: str | None = None
    kickoff_at: datetime | None = None
    bookmaker: str
    profile: str
    market: str
    selection: str
    odds: Decimal | None = None
    dog_odds: Decimal | None = None
    fav_odds: Decimal | None = None
    fav_side: str | None = None
    dog_side: str | None = None
    pick_market: str | None = None
    rationale: str
    suggested_stake_ngn: Decimal
    potential_return_ngn: Decimal | None = None
    odds_captured_at: datetime | None = None
    confidence_pct: float | None = None
    confidence_label: str | None = None


class GoalMarketScanResponse(BaseModel):
    count: int
    bankroll_ngn: Decimal
    unit_pct: Decimal
    bookmaker: str | None = None
    message: str
    picks: list[GoalMarketPickOut] = Field(default_factory=list)
