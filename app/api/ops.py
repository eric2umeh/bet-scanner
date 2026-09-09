"""
Phase 7 — daily ops.

  POST /ops/daily-run
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps.admin import require_can_load_matches
from app.deps.auth import AuthUser
from app.schemas.ops import DailyOpsRequest, DailyOpsResponse
from app.services.daily_ops import run_daily_ops

router = APIRouter(prefix="/ops", tags=["ops"])


@router.post(
    "/daily-run",
    response_model=DailyOpsResponse,
    summary="Morning run: fixtures → odds → settle → brief (+ optional Telegram)",
)
def daily_run(
    body: DailyOpsRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _admin: AuthUser | None = Depends(require_can_load_matches),
) -> DailyOpsResponse:
    """
    Admin or cron (X-API-Key). Same gate as Load matches.
    """
    result = run_daily_ops(
        db,
        settings,
        sync_fixtures=body.sync_fixtures,
        sync_odds_flag=body.sync_odds,
        auto_settle=body.auto_settle,
        build_brief=body.build_brief,
        notify_telegram=body.notify_telegram,
        bankroll_ngn=body.bankroll_ngn,
        unit_pct=body.unit_pct,
        pick_market=body.pick_market,
        prefer_llm=body.prefer_llm,
    )
    return DailyOpsResponse(**result)
