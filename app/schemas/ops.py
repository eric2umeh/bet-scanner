"""JSON shapes for Phase 7 daily ops."""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class DailyOpsRequest(BaseModel):
    sync_fixtures: bool = True
    sync_odds: bool = True
    auto_settle: bool = True
    build_brief: bool = True
    notify_telegram: bool = False
    bankroll_ngn: Decimal | None = Field(default=None, gt=0)
    unit_pct: Decimal | None = Field(default=None, gt=0, le=10)
    pick_market: str = "double_chance"
    prefer_llm: bool = True


class DailyOpsResponse(BaseModel):
    ok: bool
    summary: str
    steps: list[dict[str, Any]]
    errors: list[str]
    fixtures: dict[str, Any] | None = None
    odds: dict[str, Any] | None = None
    settle: dict[str, Any] | None = None
    brief: dict[str, Any] | None = None
    learning: dict[str, Any]
    tipsters_ranked: int
    telegram: dict[str, Any] | None = None
    message: str
