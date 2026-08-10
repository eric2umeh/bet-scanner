"""
Phase 7 — daily ops pipeline (morning run).

One command / API call that:
  1) Syncs fixtures (optional)
  2) Syncs NG odds (optional — uses free quota)
  3) Auto-settles finished tips
  4) Builds AI decision brief
  5) Optionally sends Telegram digest

Designed for cron / Railway scheduled workers.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import Settings
from app.services.ai_brief import build_decision_brief, format_brief_telegram
from app.services.sync_matches import sync_matches_for_today
from app.services.sync_odds import sync_odds
from app.services.telegram_notify import send_telegram_message
from app.services.tip_learning import build_learning_model, learning_to_dict
from app.services.tips import auto_settle_finished
from app.services.tipsters import tipster_leaderboard


def run_daily_ops(
    db: Session,
    settings: Settings,
    *,
    sync_fixtures: bool = True,
    sync_odds_flag: bool = True,
    auto_settle: bool = True,
    build_brief: bool = True,
    notify_telegram: bool = False,
    bankroll_ngn: Decimal | None = None,
    unit_pct: Decimal | None = None,
    pick_market: str | None = None,
    prefer_llm: bool = True,
) -> dict:
    bankroll = (
        bankroll_ngn
        if bankroll_ngn is not None
        else Decimal(str(settings.ops_default_bankroll_ngn))
    )
    unit = (
        unit_pct
        if unit_pct is not None
        else Decimal(str(settings.bankroll_unit_pct))
    )
    market = pick_market or settings.safe_pick_market

    steps: list[dict] = []
    errors: list[str] = []

    fixtures_result = None
    if sync_fixtures:
        try:
            fixtures_result = sync_matches_for_today(db, settings)
            steps.append(
                {
                    "step": "sync_fixtures",
                    "ok": True,
                    "message": fixtures_result.get("message"),
                    "upserted": fixtures_result.get("upserted"),
                }
            )
        except Exception as exc:  # noqa: BLE001 — continue pipeline
            errors.append(f"sync_fixtures: {exc}")
            steps.append({"step": "sync_fixtures", "ok": False, "message": str(exc)})

    odds_result = None
    if sync_odds_flag:
        try:
            odds_result = sync_odds(db, settings)
            ok = bool(odds_result.get("ok", True))
            steps.append(
                {
                    "step": "sync_odds",
                    "ok": ok,
                    "message": odds_result.get("message"),
                    "inserted": odds_result.get("inserted"),
                }
            )
            if not ok:
                errors.append(f"sync_odds: {odds_result.get('message')}")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"sync_odds: {exc}")
            steps.append({"step": "sync_odds", "ok": False, "message": str(exc)})

    settle_result = None
    if auto_settle:
        try:
            settle_result = auto_settle_finished(db, settings)
            steps.append(
                {
                    "step": "auto_settle",
                    "ok": True,
                    "message": settle_result.get("message"),
                    "settled_count": settle_result.get("settled_count"),
                }
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"auto_settle: {exc}")
            steps.append({"step": "auto_settle", "ok": False, "message": str(exc)})

    brief = None
    if build_brief:
        try:
            brief = build_decision_brief(
                db,
                settings,
                bankroll_ngn=bankroll,
                unit_pct=unit,
                pick_market=market,
                prefer_llm=prefer_llm,
                notify_max_explains=settings.ops_brief_max_explains,
            )
            steps.append(
                {
                    "step": "brief",
                    "ok": True,
                    "message": brief.get("message"),
                    "safe_count": brief.get("safe", {}).get("count"),
                    "value_count": brief.get("value", {}).get("count"),
                    "arb_count": brief.get("arbitrage", {}).get("count"),
                }
            )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"brief: {exc}")
            steps.append({"step": "brief", "ok": False, "message": str(exc)})

    learning = learning_to_dict(build_learning_model(db))
    board = tipster_leaderboard(db, min_settled=1)

    telegram_info = None
    if notify_telegram:
        text_parts = ["Bet Scanner — daily ops", ""]
        for s in steps:
            mark = "✓" if s.get("ok") else "✗"
            text_parts.append(f"{mark} {s.get('step')}: {s.get('message')}")
        text_parts.append("")
        text_parts.append(
            f"Safe hit-rate: {learning.get('hit_rate_pct')}% "
            f"({learning.get('won', 0)}/{learning.get('settled', 0)})"
        )
        text_parts.append(f"Tipsters ranked: {board.get('count', 0)}")
        if brief:
            text_parts.append("")
            text_parts.append(format_brief_telegram(brief))
        telegram_info = send_telegram_message(settings, "\n".join(text_parts))

    ok = len(errors) == 0
    summary = (
        f"Daily ops {'OK' if ok else 'completed with errors'}: "
        + ", ".join(
            f"{s['step']}={'ok' if s.get('ok') else 'fail'}" for s in steps
        )
    )

    return {
        "ok": ok,
        "summary": summary,
        "steps": steps,
        "errors": errors,
        "fixtures": fixtures_result,
        "odds": odds_result,
        "settle": settle_result,
        "brief": brief,
        "learning": {
            "hit_rate_pct": learning.get("hit_rate_pct"),
            "settled": learning.get("settled"),
            "won": learning.get("won"),
            "lost": learning.get("lost"),
        },
        "tipsters_ranked": board.get("count", 0),
        "telegram": telegram_info,
        "message": summary,
    }
