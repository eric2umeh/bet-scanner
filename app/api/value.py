"""
Value / EV endpoints (Phase 5A).

  GET  /value/scan
  POST /value/evaluate
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.value import (
    ValueEvaluateRequest,
    ValueEvaluateResponse,
    ValuePickOut,
    ValueScanResponse,
)
from app.services.scan_value import scan_value_1x2
from app.services.value_math import (
    average_fair_probs,
    expected_value_pct,
    fair_odds,
)

router = APIRouter(prefix="/value", tags=["value"])

_SELS = ("home", "draw", "away")


@router.get(
    "/scan",
    response_model=ValueScanResponse,
    summary="Scan cross-book 1X2 value (de-vig EV, Phase 5A)",
)
def scan_value(
    min_ev_pct: Decimal | None = Query(
        default=None,
        description="Minimum EV % (default VALUE_MIN_EV_PCT)",
    ),
    max_odds_age_minutes: int | None = Query(default=None, ge=1, le=24 * 60),
    bankroll_ngn: Decimal = Query(default=Decimal("50000"), gt=0),
    unit_pct: Decimal | None = Query(default=None, gt=0, le=10),
    bookmakers: str | None = Query(
        default="sportybet,bet9ja",
        description="Comma list, e.g. sportybet,bet9ja",
    ),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ValueScanResponse:
    allowed = None
    if bookmakers:
        allowed = {b.strip().lower() for b in bookmakers.split(",") if b.strip()}
    result = scan_value_1x2(
        db,
        settings,
        min_ev_pct=min_ev_pct,
        max_age_minutes=max_odds_age_minutes,
        bankroll_ngn=bankroll_ngn,
        unit_pct=unit_pct,
        allowed_bookmakers=allowed,
    )
    return ValueScanResponse(
        count=result["count"],
        min_ev_pct=result["min_ev_pct"],
        max_odds_age_minutes=result["max_odds_age_minutes"],
        bankroll_ngn=result["bankroll_ngn"],
        unit_pct=result["unit_pct"],
        one_unit_ngn=result["one_unit_ngn"],
        picks=[ValuePickOut(**p) for p in result["picks"]],
        message=result["message"],
    )


@router.post(
    "/evaluate",
    response_model=ValueEvaluateResponse,
    summary="Paste multi-book 1X2 odds → fair probs + EV (no DB)",
)
def evaluate_value(body: ValueEvaluateRequest) -> ValueEvaluateResponse:
    books_odds: list[list[Decimal]] = []
    book_names: list[str] = []
    for name, sels in body.books.items():
        try:
            row = [Decimal(str(sels[s])) for s in _SELS]
        except KeyError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Book {name} missing selection: {exc}",
            ) from exc
        books_odds.append(row)
        book_names.append(name.lower())

    if len(books_odds) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 books")

    fair_ps = average_fair_probs(books_odds)
    fair_p_map = {s: fair_ps[i].quantize(Decimal("0.0001")) for i, s in enumerate(_SELS)}
    fair_o_map = {s: fair_odds(fair_ps[i]) for i, s in enumerate(_SELS)}

    picks: list[dict] = []
    for i, sel in enumerate(_SELS):
        prices = [
            (book_names[j], books_odds[j][i]) for j in range(len(books_odds))
        ]
        best_book, best_odds = max(prices, key=lambda x: x[1])
        others = [p for b, p in prices if b != best_book]
        if not others or best_odds <= min(others):
            continue
        ev = expected_value_pct(best_odds, fair_ps[i])
        if ev < body.min_ev_pct:
            continue
        picks.append(
            {
                "selection": sel,
                "bookmaker": best_book,
                "odds": best_odds,
                "fair_odds": fair_o_map[sel],
                "fair_prob": fair_p_map[sel],
                "ev_pct": ev,
            }
        )
    picks.sort(key=lambda p: p["ev_pct"], reverse=True)

    return ValueEvaluateResponse(
        fair_probs=fair_p_map,
        fair_odds=fair_o_map,
        picks=picks,
        message=(
            f"{len(picks)} selection(s) with EV ≥ {body.min_ev_pct}% "
            f"across {len(book_names)} books."
        ),
    )
