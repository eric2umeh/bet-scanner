"""Phase 15A/B/C/D — Code Scout schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.schemas.convert import ConvertedLegOut


class ScoutSafetyEdit(BaseModel):
    kind: str
    severity: str = "medium"
    title: str
    detail: str
    leg_index: int | None = None


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
    # Phase 15C
    safety_edits: list[ScoutSafetyEdit] = Field(default_factory=list)
    safety_summary: str | None = None
    # Phase 15D
    convertible: bool = False
    convert_target: str | None = None


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


class ScoutConvertResponse(BaseModel):
    convertible: bool
    source_book: str
    target_book: str
    code_text: str
    slip_text: str | None = None
    legs: list[ConvertedLegOut] = Field(default_factory=list)
    matched_count: int = 0
    combined_sportybet: Decimal | None = None
    combined_bet9ja: Decimal | None = None
    combined_best_mixed: Decimal | None = None
    combined_target: Decimal | None = None
    place_summary: str = ""
    message: str
