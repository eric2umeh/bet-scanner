"""
Phase 5 — value tip helpers (log + Telegram digest).
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.services.tips import create_tip, tip_to_dict


def format_value_pick_text(pick: dict) -> str:
    home = pick.get("home_team", "?")
    away = pick.get("away_team", "?")
    lines = [
        f"Value: {home} vs {away}",
        (
            f"{pick.get('selection')} @ {pick.get('odds')} on {pick.get('bookmaker')} "
            f"| fair ~{pick.get('fair_odds')} | EV ~{pick.get('ev_pct')}%"
        ),
        (
            f"Stake ₦{pick.get('suggested_stake_ngn')} "
            f"→ return ~₦{pick.get('potential_return_ngn')}"
        ),
        "",
        "Risked pick (not a surebet). Verify live before placing.",
    ]
    warn = pick.get("warning")
    if warn:
        lines.append(str(warn))
    return "\n".join(lines)


def format_value_digest(picks: list[dict], title: str = "Value alert") -> str:
    if not picks:
        return f"{title}\n(no value picks)"
    chunks = [title, ""]
    for p in picks[:10]:
        chunks.append(format_value_pick_text(p))
        chunks.append("---")
    if len(picks) > 10:
        chunks.append(f"…and {len(picks) - 10} more")
    return "\n".join(chunks)


def log_value_picks(
    db: Session,
    picks: list[dict],
    *,
    source: str = "value",
) -> dict:
    """Save value singles as tips (source=value)."""
    created: list[dict] = []
    skipped: list[dict] = []
    errors: list[str] = []

    for p in picks:
        mid = p.get("match_id")
        if not mid:
            errors.append("pick missing match_id")
            continue
        stake = p.get("suggested_stake_ngn")
        if stake is not None:
            stake = Decimal(str(stake))
        odds = p.get("odds")
        if odds is not None:
            odds = Decimal(str(odds))

        tip, status = create_tip(
            db,
            match_id=int(mid),
            risk_profile=str(p.get("profile") or "value_cross_book"),
            market=str(p.get("market") or "1X2"),
            selection=str(p["selection"]),
            odds_price=odds,
            bookmaker=p.get("bookmaker"),
            stake_ngn=stake,
            pick_market="1x2",
            dog_odds=None,
            fav_odds=None,
            source=source,
            rationale=p.get("rationale") or format_value_pick_text(p),
            skip_duplicate=True,
        )
        if status == "created" and tip is not None:
            created.append(tip_to_dict(tip))
        elif status == "duplicate" and tip is not None:
            skipped.append(
                {
                    "tip_id": tip.id,
                    "match_id": mid,
                    "selection": p.get("selection"),
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
            f"Logged {len(created)} value tip(s); "
            f"skipped {len(skipped)} duplicate(s)."
        ),
    }
