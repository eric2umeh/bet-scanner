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
from app.services.scan_arbitrage import calculate_from_request, scan_arbs

router = APIRouter(prefix="/arbitrage", tags=["arbitrage"])


@router.get(
    "/scan",
    response_model=ScanResponse,
    summary="Scan surebets across all synced bookmakers",
)
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
    bookmakers: str | None = Query(
        default=None,
        description=(
            "Optional comma list to limit books, e.g. sportybet,melbet. "
            "Omit to scan every bookmaker with fresh 1X2 / O/U / BTTS odds."
        ),
    ),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ScanResponse:
    """
    Scan stored odds for surebets: 1X2 (3-way), O/U 0.5/1.5/2.5 and BTTS (2-way).

    Best price per outcome across books; requires ≥2 distinct books and a complete
    mutually exclusive outcome set for the same event + market + line.
    """
    allowed = None
    if bookmakers:
        allowed = {b.strip().lower() for b in bookmakers.split(",") if b.strip()}
    result = scan_arbs(
        db,
        settings,
        min_profit_pct=min_profit_pct,
        max_age_minutes=max_odds_age_minutes,
        sample_stake_ngn=sample_stake_ngn,
        allowed_bookmakers=allowed,
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
