"""JSON shapes for Phase 5B AI explain / decision brief."""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class ExplainRequest(BaseModel):
    engine: str = Field(
        default="safe_builder",
        description="safe_builder | value | arbitrage",
        examples=["safe_builder"],
    )
    pick: dict[str, Any] = Field(
        ...,
        description="Pick object from a scan (or tip fields)",
    )
    prefer_llm: bool = True
    question: str | None = Field(
        default=None,
        description="Optional extra question for the LLM",
    )


class ExplainResponse(BaseModel):
    engine: str
    mode: str
    explanation: str
    template_fallback: str
    message: str


class BriefRequest(BaseModel):
    bankroll_ngn: Decimal = Field(default=Decimal("50000"), gt=0)
    unit_pct: Decimal | None = Field(default=None, gt=0, le=10)
    pick_market: str = "double_chance"
    prefer_llm: bool = True
    notify_telegram: bool = False
    max_explains: int = Field(default=3, ge=0, le=8)


class BriefResponse(BaseModel):
    bankroll_ngn: Decimal
    unit_pct: Decimal
    summary: str
    safe: dict[str, Any]
    value: dict[str, Any]
    arbitrage: dict[str, Any]
    explanations: list[dict[str, Any]]
    learning: dict[str, Any]
    message: str
    telegram: dict[str, Any] | None = None
