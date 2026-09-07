"""
Scan the `odds` table for surebets (Phase 3A + Phase A 2-ways).

Pipeline (market-aware):
  1) Latest odds per (match, book, market, selection)
  2) Group by event + market (line is encoded in market key, e.g. ou_2_5)
  3) Best price per required outcome across books
  4) Require a complete mutually exclusive set + ≥2 distinct books
  5) A = Σ(1/odds) < 1 → stake plan

Supported:
  - 1X2 → home / draw / away (3-way)
  - O/U 0.5 / 1.5 / 2.5 → over / under (2-way, same line only)
  - BTTS → yes / no (2-way)

Not in this phase: Double Chance (overlapping), team totals, Asian lines.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import Settings
from app.models import Match
from app.services.arbitrage_math import (
    ArbLeg,
    arbitrage_profit_pct,
    calculate_stakes,
    is_arbitrage,
    looks_like_palpable_error,
)
from app.services.match_bettable import match_still_bettable

# market_key → ordered required selections (mutually exclusive complete set)
MARKET_OUTCOME_SETS: dict[str, tuple[str, ...]] = {
    "1X2": ("home", "draw", "away"),
    "ou_0_5": ("over", "under"),
    "ou_1_5": ("over", "under"),
    "ou_2_5": ("over", "under"),
    "btts": ("yes", "no"),
}

PHASE_A_MARKETS = tuple(MARKET_OUTCOME_SETS.keys())


def scan_arbs(
    db: Session,
    settings: Settings,
    min_profit_pct: Decimal | None = None,
    max_age_minutes: int | None = None,
    sample_stake_ngn: Decimal = Decimal("10000"),
    allowed_bookmakers: set[str] | None = None,
    markets: tuple[str, ...] | None = None,
) -> dict:
    """
    Scan 1X2 + O/U + BTTS surebets from stored odds.

    `markets` defaults to Phase A set. Pass ("1X2",) for 1X2-only.
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
    scan_markets = markets if markets is not None else PHASE_A_MARKETS
    scan_markets = tuple(m for m in scan_markets if m in MARKET_OUTCOME_SETS)
    if not scan_markets:
        scan_markets = PHASE_A_MARKETS

    rows = _latest_odds_rows(db, scan_markets)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=max_age)

    # match_id → market → selection → [{book, price, …}]
    by_match: dict[int, dict[str, dict[str, list[dict]]]] = {}
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
        market = str(row["market"])
        selection = str(row["selection"]).lower()
        by_match.setdefault(match_id, {}).setdefault(market, {}).setdefault(
            selection, []
        ).append(
            {
                "bookmaker": row["bookmaker"],
                "market": market,
                "selection": selection,
                "odds": price,
                "captured_at": captured,
            }
        )

    opportunities: list[dict] = []
    for match_id, markets_map in by_match.items():
        match = db.get(Match, match_id)
        if match is None or not match_still_bettable(match, now=now):
            continue

        for market, selections in markets_map.items():
            needed = MARKET_OUTCOME_SETS.get(market)
            if not needed:
                continue
            opp = _opportunity_from_best_legs(
                match=match,
                market=market,
                needed=needed,
                selections=selections,
                min_profit=min_profit,
                sample_stake_ngn=sample_stake_ngn,
                round_to=round_to,
                now=now,
            )
            if opp:
                opportunities.append(opp)

    opportunities.sort(key=lambda x: x["profit_pct"], reverse=True)
    scanned_list = sorted(books_scanned)
    n = len(opportunities)
    return {
        "count": n,
        "min_profit_pct": min_profit,
        "max_odds_age_minutes": max_age,
        "books_scanned": scanned_list,
        "opportunities": opportunities,
        "message": (
            f"Found {n} surebet{'' if n == 1 else 's'} "
            f"(1X2 · O/U · BTTS)."
            + (
                f" Checked {len(scanned_list)} book"
                f"{'' if len(scanned_list) == 1 else 's'}."
                if scanned_list
                else " Refresh Today first for prices."
            )
        ),
    }


def scan_1x2_arbs(
    db: Session,
    settings: Settings,
    min_profit_pct: Decimal | None = None,
    max_age_minutes: int | None = None,
    sample_stake_ngn: Decimal = Decimal("10000"),
    allowed_bookmakers: set[str] | None = None,
) -> dict:
    """Backward-compatible 1X2-only scan."""
    result = scan_arbs(
        db,
        settings,
        min_profit_pct=min_profit_pct,
        max_age_minutes=max_age_minutes,
        sample_stake_ngn=sample_stake_ngn,
        allowed_bookmakers=allowed_bookmakers,
        markets=("1X2",),
    )
    n = result["count"]
    scanned_list = result["books_scanned"]
    result["message"] = (
        f"Found {n} surebet{'' if n == 1 else 's'}."
        + (
            f" Checked {len(scanned_list)} book"
            f"{'' if len(scanned_list) == 1 else 's'}."
            if scanned_list
            else " Refresh Today first for prices."
        )
    )
    return result


def _latest_odds_rows(db: Session, markets: tuple[str, ...]):
    # Only allow known market keys (no user string interpolation).
    allowed = [m for m in markets if m in MARKET_OUTCOME_SETS]
    if not allowed:
        return []
    placeholders = ", ".join(f":m{i}" for i in range(len(allowed)))
    params = {f"m{i}": m for i, m in enumerate(allowed)}
    latest_sql = text(
        f"""
        SELECT DISTINCT ON (o.match_id, o.bookmaker, o.market, o.selection)
            o.id,
            o.match_id,
            o.bookmaker,
            o.market,
            o.selection,
            o.price,
            o.captured_at
        FROM odds o
        WHERE o.market IN ({placeholders})
        ORDER BY o.match_id, o.bookmaker, o.market, o.selection, o.captured_at DESC
        """
    )
    return db.execute(latest_sql, params).mappings().all()


def _opportunity_from_best_legs(
    *,
    match: Match,
    market: str,
    needed: tuple[str, ...],
    selections: dict[str, list[dict]],
    min_profit: Decimal,
    sample_stake_ngn: Decimal,
    round_to: int,
    now: datetime,
) -> dict | None:
    if not all(sel in selections and selections[sel] for sel in needed):
        return None

    best_legs = [max(selections[sel], key=lambda x: x["odds"]) for sel in needed]
    books_used = {str(leg["bookmaker"]).lower() for leg in best_legs}
    # Cross-book only — same-book “arbs” are just the book’s own margin.
    if len(books_used) < 2:
        return None

    odds_list = [leg["odds"] for leg in best_legs]
    if not is_arbitrage(odds_list):
        return None

    profit_pct = arbitrage_profit_pct(odds_list)
    if profit_pct < min_profit:
        return None

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
                "potential_return_ngn": (plan.stakes[i] * leg["odds"]).quantize(
                    Decimal("0.01")
                ),
            }
        )

    return {
        "match_id": match.id,
        "home_team": match.home_team,
        "away_team": match.away_team,
        "competition_code": match.competition_code,
        "kickoff_at": match.kickoff_at,
        "market": market,
        "profit_pct": profit_pct.quantize(Decimal("0.01")),
        "implied_sum": plan.implied_sum,
        "legs": scan_legs,
        "books_used": sorted(books_used, key=str),
        "sample_total_stake_ngn": plan.total_stake,
        "sample_profit_ngn": plan.profit,
        "sample_legs": sample_legs,
        "warning": (
            "Profit is only locked if ALL legs are placed at these odds "
            "before books change/void them. Refresh odds often."
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
