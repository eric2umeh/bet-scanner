"""
Phase 5B — AI explain + decision brief.

  POST /ai/explain
  POST /ai/brief
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.ai import (
    BriefRequest,
    BriefResponse,
    ExplainRequest,
    ExplainResponse,
)
from app.services.ai_brief import build_decision_brief, format_brief_telegram
from app.services.ai_explain import explain_pick
from app.services.telegram_notify import send_telegram_message

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post(
    "/explain",
    response_model=ExplainResponse,
    summary="Explain one tip/pick (LLM if configured, else template)",
)
def explain_endpoint(
    body: ExplainRequest,
    settings: Settings = Depends(get_settings),
) -> ExplainResponse:
    result = explain_pick(
        settings,
        body.pick,
        engine=body.engine,
        prefer_llm=body.prefer_llm,
        extra_question=body.question,
    )
    return ExplainResponse(**result)


@router.post(
    "/brief",
    response_model=BriefResponse,
    summary="Decision brief: Safe + value + surebets with short explains",
)
def brief_endpoint(
    body: BriefRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> BriefResponse:
    brief = build_decision_brief(
        db,
        settings,
        bankroll_ngn=body.bankroll_ngn,
        unit_pct=body.unit_pct,
        pick_market=body.pick_market,
        prefer_llm=body.prefer_llm,
        notify_max_explains=body.max_explains,
    )
    telegram_info = None
    if body.notify_telegram:
        text = format_brief_telegram(brief)
        telegram_info = send_telegram_message(settings, text)
    return BriefResponse(**brief, telegram=telegram_info)
