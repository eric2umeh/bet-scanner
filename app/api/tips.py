"""
Tip logging + hit-rate endpoints (Phase 4).

  POST /tips                     — log one tip manually
  POST /tips/log-safe-scan       — scan Safe Builder + save new tips
  POST /tips/log-predictions-scan — log O/U 2.5 + BTTS lean tips
  POST /tips/log-batch           — log exactly selected tips (Phase 10C)
  GET  /tips                     — list tips
  GET  /tips/stats               — hit rate
  POST /tips/{id}/settle         — mark won/lost/void
  POST /tips/auto-settle         — settle from finished match scores
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps.auth import AuthUser, assert_resource_owner, get_current_user
from app.schemas.tips import (
    AutoSettleResponse,
    LearningResponse,
    LogArbScanRequest,
    LogArbScanResponse,
    LogPredictionsScanRequest,
    LogPredictionsScanResponse,
    LogSafeScanRequest,
    LogSafeScanResponse,
    LogValueScanRequest,
    LogValueScanResponse,
    TipBatchLogRequest,
    TipBatchLogResponse,
    TipCreate,
    TipListResponse,
    TipOut,
    TipSettleRequest,
    TipStatsResponse,
)
from app.services.arb_ops import (
    format_arbs_digest,
    format_stake_plan_text,
    log_arbitrage_opportunities,
)
from app.services.scan_arbitrage import scan_1x2_arbs
from app.services.scan_goal_markets import scan_goal_market_picks
from app.services.scan_safe_builder import scan_safe_picks
from app.services.scan_value import scan_value_1x2
from app.services.telegram_notify import format_tips_digest, send_telegram_message
from app.services.tip_learning import build_learning_model, learning_to_dict
from app.services.value_ops import format_value_digest, log_value_picks
from app.services.tips import (
    auto_settle_finished,
    create_tip,
    delete_tip,
    list_tips,
    log_safe_picks,
    log_selected_tips,
    settle_tip,
    tip_stats,
    tip_to_dict,
)

router = APIRouter(prefix="/tips", tags=["tips"])


@router.post("", response_model=TipOut, summary="Log one tip manually")
def create_tip_endpoint(
    body: TipCreate,
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
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
        confidence_pct=body.confidence_pct,
        owner_id=user.id if user else None,
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
    "/log-batch",
    response_model=TipBatchLogResponse,
    summary="Log exactly the selected tips (Phase 10C)",
)
def log_tip_batch(
    body: TipBatchLogRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: AuthUser | None = Depends(get_current_user),
) -> TipBatchLogResponse:
    """Save checked tips; same-book 2+ → one multi slip (Phase 10D)."""
    payloads = [t.model_dump() for t in body.tips]
    result = log_selected_tips(
        db,
        payloads,
        as_multi=body.as_multi,
        owner_id=user.id if user else None,
    )
    created = result["created"]

    telegram_info = None
    if body.notify_telegram and created:
        title = (
            "Multi slip logged"
            if result.get("slip_count")
            else "Selected tips logged"
        )
        text = format_tips_digest(created, title=title)
        telegram_info = send_telegram_message(settings, text)

    return TipBatchLogResponse(
        created_count=result["created_count"],
        skipped_duplicates=result["skipped_duplicates"],
        errors=result["errors"],
        created=[TipOut(**c) for c in created],
        skipped=result["skipped"],
        message=result["message"],
        telegram=telegram_info,
    )


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


@router.post(
    "/log-predictions-scan",
    response_model=LogPredictionsScanResponse,
    summary="Scan O/U 2.5 + BTTS and log new tips (Phase 10B)",
)
def log_predictions_scan(
    body: LogPredictionsScanRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LogPredictionsScanResponse:
    """
    Log goal-market lean tips so Auto-settle / hit-rate can track them.

    Note: this logs the current scan for the book — not a manual checkbox
    selection. Prefer “Log this tip” on a match card for exact slips.
    """
    wanted = {m.strip() for m in body.markets.split(",") if m.strip()}
    scan = scan_goal_market_picks(
        db,
        settings,
        bookmaker=body.bookmaker,
        max_age_minutes=body.max_odds_age_minutes,
        bankroll_ngn=body.bankroll_ngn,
        unit_pct=body.unit_pct,
        markets=wanted or None,
    )
    result = log_safe_picks(db, scan["picks"], source="goal_markets")
    telegram_info = None
    if body.notify_telegram and result["created"]:
        text = format_tips_digest(
            result["created"], title="O/U + BTTS — new tips logged"
        )
        telegram_info = send_telegram_message(settings, text)
    return LogPredictionsScanResponse(
        created_count=result["created_count"],
        skipped_duplicates=result["skipped_duplicates"],
        errors=result["errors"],
        created=[TipOut(**t) for t in result["created"]],
        skipped=result["skipped"],
        message=result["message"],
        telegram=telegram_info,
    )


@router.post(
    "/log-arbitrage-scan",
    response_model=LogArbScanResponse,
    summary="Scan NG surebets, log tips, optional Telegram alert (Phase 4.5)",
)
def log_arbitrage_scan(
    body: LogArbScanRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LogArbScanResponse:
    """
    Scan SportyBet/Bet9ja surebets with your ₦ bankroll stake split,
    optionally save each as a tip and ping Telegram.
    """
    allowed = {b.strip().lower() for b in body.bookmakers.split(",") if b.strip()}
    scan = scan_1x2_arbs(
        db,
        settings,
        min_profit_pct=body.min_profit_pct,
        max_age_minutes=body.max_odds_age_minutes,
        sample_stake_ngn=body.bankroll_ngn,
        allowed_bookmakers=allowed or None,
    )
    opps = scan.get("opportunities") or []
    plans = [format_stake_plan_text(o) for o in opps]

    created: list[dict] = []
    skipped: list[dict] = []
    errors: list[str] = []
    log_msg = "Tips not logged (log_tips=false)."
    if body.log_tips and opps:
        result = log_arbitrage_opportunities(db, opps)
        created = result["created"]
        skipped = result["skipped"]
        errors = result["errors"]
        log_msg = result["message"]
    elif body.log_tips and not opps:
        log_msg = "No surebets to log."

    telegram_info = None
    if body.notify_telegram:
        if opps:
            text = format_arbs_digest(
                opps,
                title=f"Surebet alert — {len(opps)} found (₦{body.bankroll_ngn})",
            )
            telegram_info = send_telegram_message(settings, text)
        else:
            telegram_info = {
                "ok": True,
                "message": "No surebets — Telegram not sent.",
            }

    return LogArbScanResponse(
        scan_count=len(opps),
        created_count=len(created),
        skipped_duplicates=len(skipped),
        errors=errors,
        opportunities=opps,
        created=[TipOut(**t) for t in created],
        skipped=skipped,
        message=f"{scan.get('message', '')} {log_msg}".strip(),
        telegram=telegram_info,
        stake_plans=plans,
    )


@router.post(
    "/log-value-scan",
    response_model=LogValueScanResponse,
    summary="Scan cross-book value, log tips, optional Telegram (Phase 5)",
)
def log_value_scan(
    body: LogValueScanRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LogValueScanResponse:
    """
    Scan SportyBet/Bet9ja for positive-EV 1X2 singles vs de-vig consensus,
    optionally save each as a tip and ping Telegram.
    """
    allowed = {b.strip().lower() for b in body.bookmakers.split(",") if b.strip()}
    scan = scan_value_1x2(
        db,
        settings,
        min_ev_pct=body.min_ev_pct,
        max_age_minutes=body.max_odds_age_minutes,
        bankroll_ngn=body.bankroll_ngn,
        unit_pct=body.unit_pct,
        allowed_bookmakers=allowed or None,
    )
    picks = scan.get("picks") or []

    created: list[dict] = []
    skipped: list[dict] = []
    errors: list[str] = []
    log_msg = "Tips not logged (log_tips=false)."
    if body.log_tips and picks:
        result = log_value_picks(db, picks)
        created = result["created"]
        skipped = result["skipped"]
        errors = result["errors"]
        log_msg = result["message"]
    elif body.log_tips and not picks:
        log_msg = "No value picks to log."

    telegram_info = None
    if body.notify_telegram:
        if picks:
            text = format_value_digest(
                picks,
                title=f"Value alert — {len(picks)} pick(s)",
            )
            telegram_info = send_telegram_message(settings, text)
        else:
            telegram_info = {
                "ok": True,
                "message": "No value picks — Telegram not sent.",
            }

    return LogValueScanResponse(
        scan_count=len(picks),
        created_count=len(created),
        skipped_duplicates=len(skipped),
        errors=errors,
        picks=picks,
        created=[TipOut(**t) for t in created],
        skipped=skipped,
        message=f"{scan.get('message', '')} {log_msg}".strip(),
        telegram=telegram_info,
    )


@router.get("", response_model=TipListResponse)
def list_tips_endpoint(
    result: str | None = Query(default=None, description="pending|won|lost|void"),
    source: str | None = Query(
        default=None,
        description="safe_builder|manual|arbitrage|value",
    ),
    market: str | None = Query(
        default=None,
        description="all|double_chance|1x2|ou_2_5|btts",
    ),
    q: str | None = Query(default=None, description="Search teams, market, book"),
    date_from: date | None = Query(default=None, description="Created on/after (UTC date)"),
    date_to: date | None = Query(default=None, description="Created on/before (UTC date)"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> TipListResponse:
    page = list_tips(
        db,
        result=result,
        source=source,
        market=market,
        q=q,
        date_from=date_from,
        date_to=date_to,
        offset=offset,
        limit=limit,
        owner_id=user.id if user else None,
    )
    return TipListResponse(
        items=[TipOut(**t) for t in page["items"]],
        has_more=page["has_more"],
        limit=page["limit"],
        offset=page["offset"],
    )


@router.get("/stats", response_model=TipStatsResponse)
def tips_stats_endpoint(
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> TipStatsResponse:
    return TipStatsResponse(**tip_stats(db, owner_id=user.id if user else None))


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
def auto_settle_endpoint(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: AuthUser | None = Depends(get_current_user),
) -> AutoSettleResponse:
    """Use finished match scores to mark pending tips won/lost."""
    result = auto_settle_finished(db, settings, owner_id=user.id if user else None)
    return AutoSettleResponse(
        settled_count=result["settled_count"],
        unresolved_count=result["unresolved_count"],
        settled=[TipOut(**t) for t in result["settled"]],
        unresolved=result["unresolved"],
        message=result["message"],
    )


@router.delete("/{tip_id}", summary="Remove a logged tip")
def delete_tip_endpoint(
    tip_id: int,
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> dict:
    try:
        delete_tip(db, tip_id, owner_id=user.id if user else None)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "message": f"Tip #{tip_id} removed."}


@router.post("/{tip_id}/settle", response_model=TipOut)
def settle_tip_endpoint(
    tip_id: int,
    body: TipSettleRequest,
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> TipOut:
    try:
        tip = settle_tip(
            db,
            tip_id,
            body.result.lower().strip(),
            apply_to_slip=bool(body.apply_to_slip),
            owner_id=user.id if user else None,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return TipOut(**tip_to_dict(tip))
