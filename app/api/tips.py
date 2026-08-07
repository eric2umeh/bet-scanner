"""
Tip logging + hit-rate endpoints (Phase 4).

  POST /tips                     — log one tip manually
  POST /tips/log-safe-scan       — scan Safe Builder + save new tips
  GET  /tips                     — list tips
  GET  /tips/stats               — hit rate
  POST /tips/{id}/settle         — mark won/lost/void
  POST /tips/auto-settle         — settle from finished match scores
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.tips import (
    AutoSettleResponse,
    LearningResponse,
    LogSafeScanRequest,
    LogSafeScanResponse,
    TipCreate,
    TipOut,
    TipSettleRequest,
    TipStatsResponse,
)
from app.services.scan_safe_builder import scan_safe_picks
from app.services.telegram_notify import format_tips_digest, send_telegram_message
from app.services.tip_learning import build_learning_model, learning_to_dict
from app.services.tips import (
    auto_settle_finished,
    create_tip,
    list_tips,
    log_safe_picks,
    settle_tip,
    tip_stats,
    tip_to_dict,
)

router = APIRouter(prefix="/tips", tags=["tips"])


@router.post("", response_model=TipOut, summary="Log one tip manually")
def create_tip_endpoint(
    body: TipCreate,
    db: Session = Depends(get_db),
) -> TipOut:
    tip, status = create_tip(
        db,
        match_id=body.match_id,
        risk_profile=body.risk_profile,
        market=body.market,
        selection=body.selection,
        odds_price=body.odds_price,
        bookmaker=body.bookmaker,
        stake_ngn=body.stake_ngn,
        source=body.source,
        rationale=body.rationale,
        skip_duplicate=True,
    )
    if tip is None:
        raise HTTPException(status_code=400, detail=status)
    if status == "duplicate":
        raise HTTPException(
            status_code=409,
            detail=f"Pending tip already exists (id={tip.id})",
        )
    return TipOut(**tip_to_dict(tip))


@router.post(
    "/log-safe-scan",
    response_model=LogSafeScanResponse,
    summary="Scan Safe Builder and log new tips",
)
def log_safe_scan(
    body: LogSafeScanRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LogSafeScanResponse:
    scan = scan_safe_picks(
        db,
        settings,
        bookmaker=body.bookmaker,
        max_age_minutes=body.max_odds_age_minutes,
        bankroll_ngn=body.bankroll_ngn,
        unit_pct=body.unit_pct,
        pick_market=body.pick_market,
    )
    result = log_safe_picks(db, scan["picks"])
    telegram_info = None
    if body.notify_telegram and result["created"]:
        text = format_tips_digest(result["created"], title="Safe Builder — new tips logged")
        telegram_info = send_telegram_message(settings, text)
    return LogSafeScanResponse(
        created_count=result["created_count"],
        skipped_duplicates=result["skipped_duplicates"],
        errors=result["errors"],
        created=[TipOut(**t) for t in result["created"]],
        skipped=result["skipped"],
        message=result["message"],
        telegram=telegram_info,
    )


@router.get("", response_model=list[TipOut])
def list_tips_endpoint(
    result: str | None = Query(default=None, description="pending|won|lost|void"),
    source: str | None = Query(default=None, description="safe_builder|manual|arbitrage"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[TipOut]:
    return [TipOut(**t) for t in list_tips(db, result=result, source=source, limit=limit)]


@router.get("/stats", response_model=TipStatsResponse)
def tips_stats_endpoint(db: Session = Depends(get_db)) -> TipStatsResponse:
    return TipStatsResponse(**tip_stats(db))


@router.get(
    "/learning",
    response_model=LearningResponse,
    summary="What the system learned from won/lost tips",
)
def tips_learning_endpoint(db: Session = Depends(get_db)) -> LearningResponse:
    """
    Hit rates by market/profile/odds-band used to rank future Safe Builder picks.
    Settle tips (Won/Lost) so this improves over time.
    """
    return LearningResponse(**learning_to_dict(build_learning_model(db)))


@router.post("/auto-settle", response_model=AutoSettleResponse)
def auto_settle_endpoint(db: Session = Depends(get_db)) -> AutoSettleResponse:
    """Use finished match scores to mark pending tips won/lost."""
    result = auto_settle_finished(db)
    return AutoSettleResponse(
        settled_count=result["settled_count"],
        unresolved_count=result["unresolved_count"],
        settled=[TipOut(**t) for t in result["settled"]],
        unresolved=result["unresolved"],
        message=result["message"],
    )


@router.post("/{tip_id}/settle", response_model=TipOut)
def settle_tip_endpoint(
    tip_id: int,
    body: TipSettleRequest,
    db: Session = Depends(get_db),
) -> TipOut:
    try:
        tip = settle_tip(db, tip_id, body.result.lower().strip())
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return TipOut(**tip_to_dict(tip))
