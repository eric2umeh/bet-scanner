"""
Bankroll + Safe Builder endpoints (Phase 3C).

Try in http://127.0.0.1:8000/docs or the simple dashboard at /
  POST /bankroll/size
  GET  /safe-builder/scan
  POST /safe-builder/evaluate
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.safe_builder import (
    BankrollSizeRequest,
    BankrollSizeResponse,
    EvaluateRequest,
    EvaluateResponse,
    SafePickOut,
    SafeScanResponse,
)
from app.services.bankroll import stake_for_profile, unit_stake_ngn
from app.services.scan_safe_builder import evaluate_prices_dict, scan_safe_picks

router = APIRouter(tags=["safe-builder"])


@router.post("/bankroll/size", response_model=BankrollSizeResponse)
def size_bankroll(
    body: BankrollSizeRequest,
    settings: Settings = Depends(get_settings),
) -> BankrollSizeResponse:
    """
    Turn bankroll + unit % into a Naira stake.

    Example: ₦50,000 at 1% = ₦500 per unit.
    """
    one = unit_stake_ngn(body.bankroll_ngn, body.unit_pct, body.round_to)
    if body.profile:
        suggested = stake_for_profile(
            body.bankroll_ngn,
            body.profile,
            unit_pct=body.unit_pct,
            round_to=body.round_to,
        )
        msg = f"1 unit = ₦{one}; profile {body.profile} → ₦{suggested}"
    else:
        suggested = one
        msg = f"1 unit = ₦{one} ({body.unit_pct}% of ₦{body.bankroll_ngn})"
    return BankrollSizeResponse(
        bankroll_ngn=body.bankroll_ngn,
        unit_pct=body.unit_pct,
        one_unit_ngn=one,
        profile=body.profile,
        suggested_stake_ngn=suggested,
        message=msg,
    )


@router.get(
    "/safe-builder/scan",
    response_model=SafeScanResponse,
    summary="Scan Safe Builder picks from stored odds",
)
def scan_safe_builder(
    bookmaker: str = Query(
        default="sportybet",
        description="Build slips on one book (default SportyBet)",
    ),
    max_odds_age_minutes: int | None = Query(default=None, ge=1, le=24 * 60),
    bankroll_ngn: Decimal = Query(default=Decimal("50000"), gt=0),
    unit_pct: Decimal | None = Query(default=None, gt=0, le=10),
    profiles: str | None = Query(
        default=None,
        description=(
            "Optional filter, comma-separated: "
            "safe_double_chance,accumulator_flex"
        ),
    ),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> SafeScanResponse:
    """
    Apply Eric's underdog/favourite/DC/flex rules to latest 1X2 odds.

    Not surebets — these can still lose. Stake sizes come from bankroll units.
    """
    allowed = None
    if profiles:
        allowed = {p.strip() for p in profiles.split(",") if p.strip()}
    result = scan_safe_picks(
        db,
        settings,
        bookmaker=bookmaker or None,
        max_age_minutes=max_odds_age_minutes,
        bankroll_ngn=bankroll_ngn,
        unit_pct=unit_pct,
        profiles=allowed,
    )
    return SafeScanResponse(
        count=result["count"],
        bankroll_ngn=result["bankroll_ngn"],
        unit_pct=result["unit_pct"],
        bookmaker=result["bookmaker"],
        message=result["message"],
        picks=[SafePickOut(**p) for p in result["picks"]],
    )


@router.post("/safe-builder/evaluate", response_model=EvaluateResponse)
def evaluate_safe_builder(
    body: EvaluateRequest,
    settings: Settings = Depends(get_settings),
) -> EvaluateResponse:
    """
    Paste any match's 1X2 odds and see which Safe Builder rule fires.

    Great for checking prices you see on SportyBet / odds-api.io.
    """
    result = evaluate_prices_dict(
        body.home,
        body.draw,
        body.away,
        settings,
        bookmaker=body.bookmaker,
        bankroll_ngn=body.bankroll_ngn,
        unit_pct=body.unit_pct,
    )
    pick = None
    if result["pick"]:
        pick = SafePickOut(**result["pick"])
    return EvaluateResponse(
        fits_rules=result["fits_rules"],
        message=result["message"],
        pick=pick,
    )
