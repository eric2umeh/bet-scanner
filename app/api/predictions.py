"""
Phase 10B — O/U 2.5 + BTTS lean tips.

  GET /predictions/scan?bookmaker=sportybet&markets=ou_2_5,btts
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.predictions import GoalMarketPickOut, GoalMarketScanResponse
from app.services.scan_goal_markets import scan_goal_market_picks

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.get(
    "/scan",
    response_model=GoalMarketScanResponse,
    summary="Scan O/U 2.5 and BTTS market-lean tips",
)
def scan_predictions(
    bookmaker: str = Query(default="sportybet"),
    markets: str = Query(
        default="ou_0_5,ou_1_5,ou_2_5,btts,tt_2_5",
        description="Comma list: ou_0_5, ou_1_5, ou_2_5, btts, tt_2_5",
    ),
    max_odds_age_minutes: int | None = Query(default=None, ge=1, le=24 * 60),
    bankroll_ngn: Decimal = Query(default=Decimal("50000"), gt=0),
    unit_pct: Decimal | None = Query(default=None, gt=0, le=10),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> GoalMarketScanResponse:
    wanted = {m.strip() for m in markets.split(",") if m.strip()}
    result = scan_goal_market_picks(
        db,
        settings,
        bookmaker=bookmaker or None,
        max_age_minutes=max_odds_age_minutes,
        bankroll_ngn=bankroll_ngn,
        unit_pct=unit_pct,
        markets=wanted or None,
    )
    return GoalMarketScanResponse(
        count=result["count"],
        bankroll_ngn=result["bankroll_ngn"],
        unit_pct=result["unit_pct"],
        bookmaker=result["bookmaker"],
        message=result["message"],
        picks=[GoalMarketPickOut(**p) for p in result["picks"]],
    )
