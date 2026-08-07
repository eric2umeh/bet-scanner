"""JSON shapes for tip logging + hit-rate (Phase 4)."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TipCreate(BaseModel):
    match_id: int
    risk_profile: str = Field(examples=["safe_double_chance"])
    market: str = Field(examples=["double_chance"])
    selection: str = Field(examples=["1X"])
    odds_price: Decimal | None = None
    bookmaker: str | None = Field(default=None, examples=["sportybet"])
    stake_ngn: Decimal | None = None
    source: str = "manual"
    rationale: str | None = None


class TipOut(BaseModel):
    id: int
    match_id: int
    home_team: str
    away_team: str
    competition_code: str
    kickoff_at: datetime | None = None
    match_status: str | None = None
    home_score: int | None = None
    away_score: int | None = None
    risk_profile: str
    market: str
    selection: str
    odds_price: Decimal | None = None
    bookmaker: str | None = None
    stake_ngn: Decimal | None = None
    pick_market: str | None = None
    dog_odds: Decimal | None = None
    fav_odds: Decimal | None = None
    source: str
    rationale: str | None = None
    result: str
    created_at: datetime | None = None
    settled_at: datetime | None = None


class LearningResponse(BaseModel):
    settled: int
    won: int
    lost: int
    hit_rate_pct: float | None
    preferred_pick_market: str
    by_market: list[dict]
    by_profile: list[dict]
    by_dog_bucket: list[dict]
    insights: list[str]
    message: str


class TipSettleRequest(BaseModel):
    result: str = Field(examples=["won"], description="won | lost | void | pending")


class LogSafeScanRequest(BaseModel):
    bookmaker: str = "sportybet"
    bankroll_ngn: Decimal = Field(default=Decimal("50000"), gt=0)
    unit_pct: Decimal | None = Field(default=None, gt=0, le=10)
    notify_telegram: bool = False
    max_odds_age_minutes: int | None = Field(default=None, ge=1, le=24 * 60)
    pick_market: str = Field(
        default="double_chance",
        description="double_chance (default) or 1x2",
        examples=["double_chance"],
    )


class LogSafeScanResponse(BaseModel):
    created_count: int
    skipped_duplicates: int
    errors: list[str]
    created: list[TipOut]
    skipped: list[dict]
    message: str
    telegram: dict | None = None


class LogArbScanRequest(BaseModel):
    """Phase 4.5 — scan NG surebets, optional log + Telegram alert."""

    bookmakers: str = "sportybet,bet9ja"
    bankroll_ngn: Decimal = Field(default=Decimal("10000"), gt=0)
    min_profit_pct: Decimal = Field(default=Decimal("0.01"), ge=0)
    max_odds_age_minutes: int | None = Field(default=None, ge=1, le=24 * 60)
    log_tips: bool = True
    notify_telegram: bool = False


class LogArbScanResponse(BaseModel):
    scan_count: int
    created_count: int
    skipped_duplicates: int
    errors: list[str]
    opportunities: list[dict]
    created: list[TipOut]
    skipped: list[dict]
    message: str
    telegram: dict | None = None
    stake_plans: list[str] = []


class LogValueScanRequest(BaseModel):
    """Phase 5 — scan cross-book value, optional log + Telegram."""

    bookmakers: str = "sportybet,bet9ja"
    bankroll_ngn: Decimal = Field(default=Decimal("50000"), gt=0)
    unit_pct: Decimal | None = Field(default=None, gt=0, le=10)
    min_ev_pct: Decimal | None = Field(default=None, ge=0)
    max_odds_age_minutes: int | None = Field(default=None, ge=1, le=24 * 60)
    log_tips: bool = True
    notify_telegram: bool = False


class LogValueScanResponse(BaseModel):
    scan_count: int
    created_count: int
    skipped_duplicates: int
    errors: list[str]
    picks: list[dict]
    created: list[TipOut]
    skipped: list[dict]
    message: str
    telegram: dict | None = None


class TipStatsResponse(BaseModel):
    total: int
    pending: int
    won: int
    lost: int
    void: int
    settled: int
    hit_rate_pct: float | None
    by_profile: list[dict]
    message: str


class AutoSettleResponse(BaseModel):
    settled_count: int
    unresolved_count: int
    settled: list[TipOut]
    unresolved: list[dict]
    message: str
