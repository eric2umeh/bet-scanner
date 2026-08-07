"""
Phase 5B — decision brief: combine Safe / value / surebet scans + short explain.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import Settings
from app.services.ai_explain import explain_pick
from app.services.scan_arbitrage import scan_1x2_arbs
from app.services.scan_safe_builder import scan_safe_picks
from app.services.scan_value import scan_value_1x2
from app.services.tip_learning import build_learning_model, learning_to_dict


def build_decision_brief(
    db: Session,
    settings: Settings,
    *,
    bankroll_ngn: Decimal = Decimal("50000"),
    unit_pct: Decimal | None = None,
    pick_market: str | None = None,
    prefer_llm: bool = True,
    notify_max_explains: int = 3,
) -> dict:
    """
    One card for the dashboard / Telegram:
      - Safe Builder top picks
      - Value +EV picks
      - Surebets (if any)
      - Short explanations for the first few items
    """
    unit = unit_pct if unit_pct is not None else Decimal(str(settings.bankroll_unit_pct))

    safe = scan_safe_picks(
        db,
        settings,
        bookmaker="sportybet",
        bankroll_ngn=bankroll_ngn,
        unit_pct=unit,
        pick_market=pick_market,
    )
    value = scan_value_1x2(
        db,
        settings,
        bankroll_ngn=bankroll_ngn,
        unit_pct=unit,
        allowed_bookmakers={"sportybet", "bet9ja"},
    )
    arbs = scan_1x2_arbs(
        db,
        settings,
        min_profit_pct=Decimal("0.01"),
        sample_stake_ngn=bankroll_ngn,
        allowed_bookmakers={"sportybet", "bet9ja"},
    )

    safe_picks = list(safe.get("picks") or [])[:5]
    value_picks = list(value.get("picks") or [])[:5]
    arb_opps = list(arbs.get("opportunities") or [])[:3]

    explains: list[dict] = []
    budget = max(0, int(notify_max_explains))

    def _add(engine: str, pick: dict) -> None:
        nonlocal budget
        if budget <= 0:
            return
        exp = explain_pick(
            settings, pick, engine=engine, prefer_llm=prefer_llm
        )
        explains.append(
            {
                "engine": engine,
                "match": f"{pick.get('home_team', '?')} vs {pick.get('away_team', '?')}",
                "mode": exp["mode"],
                "explanation": exp["explanation"],
            }
        )
        budget -= 1

    for p in safe_picks[:2]:
        _add("safe_builder", p)
    for p in value_picks[:1]:
        _add("value", p)
    for p in arb_opps[:1]:
        _add("arbitrage", p)

    learning = learning_to_dict(build_learning_model(db))

    summary_lines = [
        "Decision brief (Phase 5B)",
        f"Safe Builder: {safe.get('count', 0)} pick(s)",
        f"Value (+EV): {value.get('count', 0)} pick(s)",
        f"Surebets: {arbs.get('count', 0)}",
        f"Safe hit-rate (settled): {learning.get('hit_rate_pct')}% "
        f"({learning.get('won', 0)}/{learning.get('settled', 0)})",
        "",
        "Engines decide tips; AI only explains. Verify odds live.",
    ]

    return {
        "bankroll_ngn": bankroll_ngn,
        "unit_pct": unit,
        "summary": "\n".join(summary_lines),
        "safe": {
            "count": safe.get("count", 0),
            "message": safe.get("message"),
            "picks": safe_picks,
        },
        "value": {
            "count": value.get("count", 0),
            "message": value.get("message"),
            "picks": value_picks,
        },
        "arbitrage": {
            "count": arbs.get("count", 0),
            "message": arbs.get("message"),
            "opportunities": arb_opps,
        },
        "explanations": explains,
        "learning": {
            "hit_rate_pct": learning.get("hit_rate_pct"),
            "settled": learning.get("settled"),
            "preferred_pick_market": learning.get("preferred_pick_market"),
            "insights": (learning.get("insights") or [])[:3],
        },
        "message": (
            f"Brief ready: {safe.get('count', 0)} safe / "
            f"{value.get('count', 0)} value / {arbs.get('count', 0)} surebet. "
            f"{len(explains)} explanation(s)."
        ),
    }


def format_brief_telegram(brief: dict) -> str:
    chunks = [brief.get("summary") or "Decision brief", ""]
    for exp in brief.get("explanations") or []:
        chunks.append(f"[{exp.get('engine')}] {exp.get('match')}")
        chunks.append(str(exp.get("explanation") or "")[:500])
        chunks.append("---")
    if not brief.get("explanations"):
        chunks.append("(No picks to explain right now — sync odds and rescan.)")
    return "\n".join(chunks)[:3900]
