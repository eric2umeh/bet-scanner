"""
Scan the `odds` table for 1X2 surebets (Phase 3A).

Learning note:
- We take the LATEST snapshot per (match, bookmaker, market, selection).
- For soccer 1X2, a surebet needs covering home + draw + away.
- We pick the BEST (highest) odds for each selection across books,
  then check if 1/o_home + 1/o_draw + 1/o_away < 1.

Later (Phase 3B): same scanner works when SportyBet/Bet9ja odds land
in this table — no rewrite of the math.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Match
from app.services.arbitrage_math import (
    ArbLeg,
    arbitrage_profit_pct,
    calculate_stakes,
    is_arbitrage,
    looks_like_palpable_error,
)


def scan_1x2_arbs(
    db: Session,
    settings: Settings,
    min_profit_pct: Decimal | None = None,
    max_age_minutes: int | None = None,
    sample_stake_ngn: Decimal = Decimal("10000"),
    allowed_bookmakers: set[str] | None = None,
) -> dict:
    """
    Find 1X2 arbitrage opportunities from stored odds.

    Returns a dict ready for ScanResponse.
    """
    min_profit = (
        min_profit_pct
        if min_profit_pct is not None
        else Decimal(str(settings.arb_min_profit_pct))
    )
    max_age = (
        max_age_minutes
        if max_age_minutes is not None
        else settings.arb_max_odds_age_minutes
    )
    min_odds = Decimal(str(settings.arb_min_odds))
    max_odds = Decimal(str(settings.arb_max_odds))
    round_to = settings.arb_stake_round_to

    # Latest row per match/book/market/selection (Postgres DISTINCT ON)
    latest_sql = text(
        """
        SELECT DISTINCT ON (o.match_id, o.bookmaker, o.market, o.selection)
            o.id,
            o.match_id,
            o.bookmaker,
            o.market,
            o.selection,
            o.price,
            o.captured_at
        FROM odds o
        WHERE o.market = '1X2'
        ORDER BY o.match_id, o.bookmaker, o.market, o.selection, o.captured_at DESC
        """
    )
    rows = db.execute(latest_sql).mappings().all()

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=max_age)

    # Group by match_id → selection → list of (book, price, captured_at)
    by_match: dict[int, dict[str, list[dict]]] = {}
    books_scanned: set[str] = set()
    for row in rows:
        book = str(row["bookmaker"]).lower()
        if allowed_bookmakers is not None and book not in allowed_bookmakers:
            continue

        captured = row["captured_at"]
        if captured.tzinfo is None:
            captured = captured.replace(tzinfo=timezone.utc)
        if captured < cutoff:
            continue

        price = Decimal(str(row["price"]))
        if looks_like_palpable_error(price, min_odds=min_odds, max_odds=max_odds):
            continue

        books_scanned.add(book)

        match_id = int(row["match_id"])
        selection = str(row["selection"]).lower()
        by_match.setdefault(match_id, {}).setdefault(selection, []).append(
            {
                "bookmaker": row["bookmaker"],
                "market": row["market"],
                "selection": selection,
                "odds": price,
                "captured_at": captured,
            }
        )

    opportunities: list[dict] = []

    for match_id, selections in by_match.items():
        needed = ("home", "draw", "away")
        if not all(sel in selections and selections[sel] for sel in needed):
            continue

        # Best (highest) odds per selection — may be different books
        best_legs = []
        for sel in needed:
            best = max(selections[sel], key=lambda x: x["odds"])
            best_legs.append(best)

        odds_list = [leg["odds"] for leg in best_legs]
        if not is_arbitrage(odds_list):
            continue

        profit_pct = arbitrage_profit_pct(odds_list)
        if profit_pct < min_profit:
            continue

        match = db.get(Match, match_id)
        if match is None:
            continue

        arb_legs = [
            ArbLeg(
                bookmaker=leg["bookmaker"],
                market=leg["market"],
                selection=leg["selection"],
                odds=leg["odds"],
            )
            for leg in best_legs
        ]
        plan = calculate_stakes(
            arb_legs, total_stake=sample_stake_ngn, round_to=round_to
        )

        scan_legs = []
        sample_legs = []
        for i, leg in enumerate(best_legs):
            age_min = (now - leg["captured_at"]).total_seconds() / 60.0
            scan_legs.append(
                {
                    "bookmaker": leg["bookmaker"],
                    "market": leg["market"],
                    "selection": leg["selection"],
                    "odds": leg["odds"],
                    "captured_at": leg["captured_at"],
                    "age_minutes": round(age_min, 1),
                }
            )
            sample_legs.append(
                {
                    "bookmaker": leg["bookmaker"],
                    "market": leg["market"],
                    "selection": leg["selection"],
                    "odds": leg["odds"],
                    "stake_ngn": plan.stakes[i],
                    "potential_return_ngn": (
                        plan.stakes[i] * leg["odds"]
                    ).quantize(Decimal("0.01")),
                }
            )

        opportunities.append(
            {
                "match_id": match.id,
                "home_team": match.home_team,
                "away_team": match.away_team,
                "competition_code": match.competition_code,
                "kickoff_at": match.kickoff_at,
                "market": "1X2",
                "profit_pct": profit_pct.quantize(Decimal("0.01")),
                "implied_sum": plan.implied_sum,
                "legs": scan_legs,
                "books_used": sorted(
                    {str(leg["bookmaker"]).lower() for leg in best_legs},
                    key=str,
                ),
                "sample_total_stake_ngn": plan.total_stake,
                "sample_profit_ngn": plan.profit,
                "sample_legs": sample_legs,
                "warning": (
                    "Profit is only locked if ALL legs are placed at these odds "
                    "before books change/void them. Refresh odds often."
                ),
            }
        )

    opportunities.sort(key=lambda x: x["profit_pct"], reverse=True)

    scanned_list = sorted(books_scanned)

    return {
        "count": len(opportunities),
        "min_profit_pct": min_profit,
        "max_odds_age_minutes": max_age,
        "books_scanned": scanned_list,
        "opportunities": opportunities,
        "message": (
            f"Found {len(opportunities)} surebet"
            f"{'' if len(opportunities) == 1 else 's'}."
            + (
                f" Checked {len(scanned_list)} book"
                f"{'' if len(scanned_list) == 1 else 's'}."
                if scanned_list
                else " Refresh Today first for prices."
            )
        ),
    }


def calculate_from_request(
    legs_in: list[dict],
    total_stake: Decimal,
    settings: Settings,
    round_to: int | None = None,
) -> dict:
    """Wrap calculator for the HTTP layer."""
    round_step = settings.arb_stake_round_to if round_to is None else round_to
    min_odds = Decimal(str(settings.arb_min_odds))
    max_odds = Decimal(str(settings.arb_max_odds))

    legs: list[ArbLeg] = []
    warnings: list[str] = []
    for item in legs_in:
        odds = Decimal(str(item["odds"]))
        if looks_like_palpable_error(odds, min_odds=min_odds, max_odds=max_odds):
            warnings.append(
                f"Suspicious odds {odds} on {item.get('bookmaker')}/{item.get('selection')} "
                f"(outside {min_odds}–{max_odds}). Books may void this."
            )
        legs.append(
            ArbLeg(
                bookmaker=str(item["bookmaker"]),
                market=str(item.get("market") or "1X2"),
                selection=str(item["selection"]),
                odds=odds,
            )
        )

    odds_list = [leg.odds for leg in legs]
    arb = is_arbitrage(odds_list)
    plan = calculate_stakes(legs, total_stake=total_stake, round_to=round_step)

    if not arb:
        warnings.append(
            "Not a surebet: implied probabilities sum to ≥ 1. "
            "You can still see stake split, but profit is not guaranteed."
        )
    warnings.append(
        "Round stakes and place quickly. Odds can move in seconds."
    )

    out_legs = []
    for i, leg in enumerate(legs):
        out_legs.append(
            {
                "bookmaker": leg.bookmaker,
                "market": leg.market,
                "selection": leg.selection,
                "odds": leg.odds,
                "stake_ngn": plan.stakes[i],
                "potential_return_ngn": (plan.stakes[i] * leg.odds).quantize(
                    Decimal("0.01")
                ),
            }
        )

    return {
        "is_arbitrage": arb,
        "implied_sum": plan.implied_sum,
        "total_stake_ngn": plan.total_stake,
        "guaranteed_return_ngn": plan.guaranteed_return,
        "profit_ngn": plan.profit,
        "profit_pct": plan.profit_pct,
        "legs": out_legs,
        "warning": " ".join(warnings),
    }
