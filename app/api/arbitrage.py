"""
Arbitrage endpoints (Phases 3A–D).

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
from app.services.bookmakers import configured_odds_books, normalize_book_key
from app.services.scan_arbitrage import calculate_from_request, scan_arbs

router = APIRouter(prefix="/arbitrage", tags=["arbitrage"])


def _resolve_scan_books(bookmakers: str | None, settings: Settings) -> set[str] | None:
    """
    Default: configured NG books (ODDS_API_IO_BOOKMAKERS).
    Pass bookmakers=all to scan every book in the DB (incl. EU the-odds-api).
    """
    if bookmakers is None or not str(bookmakers).strip():
        return set(configured_odds_books(settings))
    raw = str(bookmakers).strip().lower()
    if raw in {"all", "*", "any"}:
        return None
    return {normalize_book_key(b) for b in raw.split(",") if b.strip()}


@router.get(
    "/scan",
    response_model=ScanResponse,
    summary="Scan surebets across synced bookmakers",
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
            "Comma list e.g. sportybet,melbet. "
            "Omit = configured ODDS_API_IO_BOOKMAKERS. "
            "Pass all to include every book in the DB (Pinnacle, Unibet, …)."
        ),
    ),
    include_coverage: bool | None = Query(
        default=None,
        description=(
            "Phase C: include exclusive DC vs 1X2 coverage pairs. "
            "Default from ARB_INCLUDE_COVERAGE_DEFAULT (false). "
            "Not labeled as standard same-market surebets."
        ),
    ),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ScanResponse:
    """
    Scan stored odds for surebets:
      Phase A — 1X2, O/U 0.5/1.5/2.5, BTTS
      Phase B — team totals 2.5 (home/away) when both Over+Under exist
      Phase C — optional exclusive DC coverage pairs

    Best price per outcome; ≥2 distinct books; complete exclusive set;
    freshness + max leg age-spread checks.
    """
    allowed = _resolve_scan_books(bookmakers, settings)
    coverage = (
        bool(include_coverage)
        if include_coverage is not None
        else bool(getattr(settings, "arb_include_coverage_default", False))
    )
    result = scan_arbs(
        db,
        settings,
        min_profit_pct=min_profit_pct,
        max_age_minutes=max_odds_age_minutes,
        sample_stake_ngn=sample_stake_ngn,
        allowed_bookmakers=allowed,
        include_coverage=coverage,
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
