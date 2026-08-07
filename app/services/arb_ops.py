"""
Phase 4.5 — surebet ops helpers (stake text, tip logging, Telegram digest).
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.services.tips import create_tip, tip_to_dict


def format_stake_plan_text(opp: dict, *, title: str | None = None) -> str:
    """Human-readable stake plan for copy / Telegram / tip rationale."""
    home = opp.get("home_team", "?")
    away = opp.get("away_team", "?")
    profit_pct = opp.get("profit_pct", "?")
    total = opp.get("sample_total_stake_ngn", "?")
    profit = opp.get("sample_profit_ngn", "?")
    legs = opp.get("sample_legs") or []

    lines = [
        title or f"Surebet: {home} vs {away}",
        f"Profit ~{profit_pct}% | total stake ₦{total} → profit ~₦{profit}",
        "",
    ]
    for i, leg in enumerate(legs, start=1):
        lines.append(
            f"{i}) {leg.get('bookmaker')} {leg.get('selection')} "
            f"@{leg.get('odds')} → stake ₦{leg.get('stake_ngn')} "
            f"(return ~₦{leg.get('potential_return_ngn')})"
        )
    lines.append("")
    lines.append(
        "Verify ALL odds live on the books before placing. "
        "Odds can move or be voided."
    )
    warning = opp.get("warning")
    if warning:
        lines.append(warning)
    # Soft caution on extreme edges (often stale / mismatched)
    try:
        if float(profit_pct) >= 15:
            lines.append(
                "⚠ Profit ≥15% is unusually high for NG books — double-check live prices."
            )
    except (TypeError, ValueError):
        pass
    return "\n".join(lines)


def format_arbs_digest(opportunities: list[dict], title: str = "Surebet alert") -> str:
    if not opportunities:
        return f"{title}\n(no surebets)"
    chunks = [title, ""]
    for opp in opportunities[:8]:
        chunks.append(format_stake_plan_text(opp))
        chunks.append("---")
    if len(opportunities) > 8:
        chunks.append(f"…and {len(opportunities) - 8} more")
    return "\n".join(chunks)


def log_arbitrage_opportunities(
    db: Session,
    opportunities: list[dict],
    *,
    source: str = "arbitrage",
) -> dict:
    """
    Save each surebet as one tip (selection=surebet) for hit-rate tracking.
    Duplicate pending/settled tips for the same match are skipped.
    """
    created: list[dict] = []
    skipped: list[dict] = []
    errors: list[str] = []

    for opp in opportunities:
        mid = opp.get("match_id")
        if not mid:
            errors.append("opportunity missing match_id")
            continue

        rationale = format_stake_plan_text(opp)
        stake = opp.get("sample_total_stake_ngn")
        if stake is not None:
            stake = Decimal(str(stake))

        tip, status = create_tip(
            db,
            match_id=int(mid),
            risk_profile="arbitrage",
            market=str(opp.get("market") or "1X2"),
            selection="surebet",
            odds_price=None,
            bookmaker="multi",
            stake_ngn=stake,
            pick_market=None,
            dog_odds=None,
            fav_odds=None,
            source=source,
            rationale=rationale,
            skip_duplicate=True,
        )
        if status == "created" and tip is not None:
            created.append(tip_to_dict(tip))
        elif status == "duplicate" and tip is not None:
            skipped.append(
                {
                    "tip_id": tip.id,
                    "match_id": mid,
                    "selection": "surebet",
                }
            )
        else:
            errors.append(status)

    return {
        "created_count": len(created),
        "skipped_duplicates": len(skipped),
        "errors": errors,
        "created": created,
        "skipped": skipped,
        "message": (
            f"Logged {len(created)} surebet tip(s); "
            f"skipped {len(skipped)} duplicate(s)."
        ),
    }
