"""
JSON shapes for arbitrage endpoints (Phase 3A).

Try in /docs:
  GET  /arbitrage/scan?min_profit_pct=0.5
  POST /arbitrage/calculate
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ArbLegIn(BaseModel):
    """User-supplied leg for the calculator."""

    bookmaker: str = Field(examples=["bet365"])
    market: str = Field(default="1X2", examples=["1X2"])
    selection: str = Field(examples=["home"])
    odds: Decimal = Field(gt=1, examples=["2.10"])


class CalculateRequest(BaseModel):
    """
    Split a Naira bankroll across surebet legs.

    Example: total_stake_ngn=10000 with 3 legs (home/draw/away).
    """

    total_stake_ngn: Decimal = Field(gt=0, examples=["10000"])
    legs: list[ArbLegIn] = Field(min_length=2)
    round_to: int | None = Field(
        default=None,
        description="Round stakes to nearest Naira step (default from settings, usually 100)",
    )


class ArbLegOut(BaseModel):
    bookmaker: str
    market: str
    selection: str
    odds: Decimal
    stake_ngn: Decimal
    potential_return_ngn: Decimal


class CalculateResponse(BaseModel):
    is_arbitrage: bool
    implied_sum: Decimal
    total_stake_ngn: Decimal
    guaranteed_return_ngn: Decimal
    profit_ngn: Decimal
    profit_pct: Decimal
    legs: list[ArbLegOut]
    warning: str


class ScanLegOut(BaseModel):
    bookmaker: str
    market: str
    selection: str
    odds: Decimal
    captured_at: datetime
    age_minutes: float


class ArbOpportunityOut(BaseModel):
    match_id: int
    home_team: str
    away_team: str
    competition_code: str
    kickoff_at: datetime
    market: str
    profit_pct: Decimal
    implied_sum: Decimal
    legs: list[ScanLegOut]
    books_used: list[str] = Field(
        default_factory=list,
        description="Bookmakers used for the best home/draw/away prices",
    )
    # Sample stake plan for ₦10,000 so the UI can show numbers immediately
    sample_total_stake_ngn: Decimal
    sample_profit_ngn: Decimal
    sample_legs: list[ArbLegOut]
    warning: str


class ScanResponse(BaseModel):
    count: int
    min_profit_pct: Decimal
    max_odds_age_minutes: int
    books_scanned: list[str] = Field(
        default_factory=list,
        description="All bookmakers with fresh 1X2 odds included in this scan",
    )
    opportunities: list[ArbOpportunityOut]
    message: str
