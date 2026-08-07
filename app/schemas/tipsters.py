"""JSON shapes for Phase 6 tipsters / booking codes."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class TipsterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128, examples=["Lagos Tips"])
    handle: str | None = Field(default=None, examples=["@lagostips"])
    platform: str | None = Field(
        default=None, examples=["instagram"], description="instagram|telegram|twitter|other"
    )
    notes: str | None = None


class TipsterOut(BaseModel):
    id: int
    name: str
    handle: str | None = None
    platform: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    codes_total: int | None = None
    codes_pending: int | None = None
    codes_settled: int | None = None


class CodeCreate(BaseModel):
    tipster_id: int
    code_text: str = Field(min_length=1, max_length=256, examples=["ABC123XYZ"])
    bookmaker: str = Field(default="sportybet", examples=["sportybet", "bet9ja"])
    stake_ngn: Decimal | None = Field(default=None, gt=0)
    odds_price: Decimal | None = Field(default=None, gt=1)
    source: str = Field(default="manual", examples=["manual", "instagram", "telegram"])
    notes: str | None = Field(
        default=None,
        description="Optional slip text — we extract market hints (1X, O2.5, BTTS…)",
    )
    markets_summary: str | None = None


class CodeOut(BaseModel):
    id: int
    tipster_id: int
    tipster_name: str
    code_text: str
    bookmaker: str
    markets_summary: str | None = None
    stake_ngn: Decimal | None = None
    odds_price: Decimal | None = None
    source: str
    notes: str | None = None
    result: str
    created_at: datetime | None = None
    settled_at: datetime | None = None


class CodeSettleRequest(BaseModel):
    result: str = Field(examples=["won"], description="won | lost | void | pending")


class CodeCreateResponse(BaseModel):
    status: str
    code: CodeOut | None = None
    message: str


class LeaderboardResponse(BaseModel):
    count: int
    min_settled: int
    leaderboard: list[dict]
    message: str
