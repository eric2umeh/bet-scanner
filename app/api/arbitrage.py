"""
Arbitrage endpoints (Phase 3A).

Try in http://127.0.0.1:8000/docs
  GET  /arbitrage/scan
  POST /arbitrage/calculate
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.arbitrage import (
    CalculateRequest,
    CalculateResponse,
    ScanResponse,
)
from app.services.scan_arbitrage import calculate_from_request, scan_1x2_arbs

router = APIRouter(prefix="/arbitrage", tags=["arbitrage"])


@router.get("/scan", response_model=ScanResponse)
def scan_arbitrage(
    min_profit_pct: Decimal | None = Query(
        default=None,
        description="Minimum theoretical profit % (default from ARB_MIN_PROFIT_PCT)",
    ),
    max_odds_age_minutes: int | None = Query(
        default=None,
        ge=1,
        le=24 * 60,
        description="Ignore odds older than this many minutes",
    ),
    sample_stake_ngn: Decimal = Query(
        default=Decimal("10000"),
        gt=0,
        description="Sample bankroll used to show stake splits (₦)",
    ),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ScanResponse:
    """
    Scan stored 1X2 odds for surebets.

    Uses best home / draw / away prices across bookmakers for each match.
    """
    result = scan_1x2_arbs(
        db,
        settings,
        min_profit_pct=min_profit_pct,
        max_age_minutes=max_odds_age_minutes,
        sample_stake_ngn=sample_stake_ngn,
    )
    return ScanResponse(**result)


@router.post("/calculate", response_model=CalculateResponse)
def calculate_arbitrage(
    body: CalculateRequest,
    settings: Settings = Depends(get_settings),
) -> CalculateResponse:
    """
    Surebet stake calculator (Naira).

    Paste any legs + total stake → exact ₦ amounts per book.
    Works even without a live scan (great for learning the math).
    """
    try:
        result = calculate_from_request(
            legs_in=[leg.model_dump() for leg in body.legs],
            total_stake=body.total_stake_ngn,
            settings=settings,
            round_to=body.round_to,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return CalculateResponse(**result)
