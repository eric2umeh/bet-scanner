"""Phase 15A/B — Code Scout schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ScoutedCodeOut(BaseModel):
    id: int
    code_text: str
    bookmaker: str
    source: str
    source_label: str | None = None
    source_url: str | None = None
    folds: int | None = None
    combined_odds: Decimal | None = None
    risk_band: str = "unknown"
    title: str | None = None
    notes: str | None = None
    scouted_at: datetime | None = None
    hub_url: str | None = None
    # Phase 15B
    verification: str = "unverified"
    confidence_pct: float | None = None
    confidence_label: str | None = "Unverified — copy only."
    legs_count: int = 0
    legs_matched: int = 0


class ScoutListResponse(BaseModel):
    count: int
    bookmaker: str
    codes: list[ScoutedCodeOut]
    message: str


class ScoutCodeCreate(BaseModel):
    code_text: str = Field(min_length=3, max_length=64)
    bookmaker: str = Field(default="sportybet", examples=["sportybet", "bet9ja"])
    source: str = Field(default="manual")
    source_label: str | None = None
    source_url: str | None = None
    folds: int | None = Field(default=None, ge=1, le=50)
    combined_odds: Decimal | None = Field(default=None, gt=1)
    title: str | None = None
    notes: str | None = None


class ScoutRefreshResponse(BaseModel):
    status: str
    upserted: int
    sources: list[str]
    message: str
