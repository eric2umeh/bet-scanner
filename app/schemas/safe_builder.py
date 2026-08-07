"""
JSON shapes for bankroll + Safe Builder (Phase 3C).
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class BankrollSizeRequest(BaseModel):
    bankroll_ngn: Decimal = Field(gt=0, examples=["50000"])
    unit_pct: Decimal = Field(default=Decimal("1"), gt=0, le=10, examples=["1"])
    profile: str | None = Field(
        default=None,
        description="Optional Safe Builder profile to scale units",
        examples=["safe_favourite"],
    )
    round_to: int = Field(default=100, ge=1)


class BankrollSizeResponse(BaseModel):
    bankroll_ngn: Decimal
    unit_pct: Decimal
    one_unit_ngn: Decimal
    profile: str | None = None
    suggested_stake_ngn: Decimal
    message: str


class EvaluateRequest(BaseModel):
    """Paste 1X2 odds to test your rules offline."""

    home: Decimal = Field(gt=1, examples=["1.16"])
    draw: Decimal = Field(gt=1, examples=["7.20"])
    away: Decimal = Field(gt=1, examples=["13.00"])
    bookmaker: str = Field(default="manual", examples=["sportybet"])
    bankroll_ngn: Decimal = Field(default=Decimal("50000"), gt=0)
    unit_pct: Decimal | None = Field(default=None, gt=0, le=10)


class SafePickOut(BaseModel):
    match_id: int | None = None
    home_team: str | None = None
    away_team: str | None = None
    competition_code: str | None = None
    kickoff_at: datetime | None = None
    bookmaker: str
    profile: str
    market: str
    selection: str
    odds: Decimal | None
    home_odds: Decimal | None = None
    draw_odds: Decimal | None = None
    away_odds: Decimal | None = None
    fav_side: str
    dog_side: str
    dog_odds: Decimal
    rationale: str
    flex_allow_misses: int | None = None
    suggested_stake_ngn: Decimal
    potential_return_ngn: Decimal | None = None
    odds_captured_at: datetime | None = None


class EvaluateResponse(BaseModel):
    fits_rules: bool
    message: str
    pick: SafePickOut | None = None


class SafeScanResponse(BaseModel):
    count: int
    bankroll_ngn: Decimal
    unit_pct: Decimal
    bookmaker: str | None
    message: str
    picks: list[SafePickOut]
