"""
Scan the `odds` table for surebets (Phases A–D).

Pipeline (market-aware — do not rebuild 1X2 from scratch):
  1) Latest odds per (match, book, market, selection)
  2) Group by event + market (line encoded in market key, e.g. ou_2_5)
  3) Best price per required outcome across books
  4) Complete mutually exclusive set + ≥2 distinct books
  5) Freshness: global max age + max age-spread between legs
  6) A = Σ(1/odds) < 1 → stake plan

Phase A (default surebets): 1X2, O/U 0.5/1.5/2.5, BTTS
Phase B: Team totals Over/Under 2.5 per side (both sides required); tighter freshness
Phase C: Optional exclusive DC coverage pairs (NOT default surebets)
Phase D: Extra books via EU totals ingest; Asian/corners keys scaffolded until feed lands
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import text
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
from app.services.match_bettable import match_still_bettable

# Logical scan market → ordered mutually exclusive selections.
# Team totals use logical keys; odds rows live under DB market `tt_2_5`.
MARKET_OUTCOME_SETS: dict[str, tuple[str, ...]] = {
    "1X2": ("home", "draw", "away"),
    "ou_0_5": ("over", "under"),
    "ou_1_5": ("over", "under"),
    "ou_2_5": ("over", "under"),
    "btts": ("yes", "no"),
    # Phase B — only when both Over+Under exist for that team
    "tt_2_5_home": ("home_over", "home_under"),
    "tt_2_5_away": ("away_over", "away_under"),
}

# Logical market → odds.market column value used when loading rows
MARKET_DB_SOURCE: dict[str, str] = {
    "tt_2_5_home": "tt_2_5",
    "tt_2_5_away": "tt_2_5",
}

PHASE_A_MARKETS = ("1X2", "ou_0_5", "ou_1_5", "ou_2_5", "btts")
PHASE_B_MARKETS = ("tt_2_5_home", "tt_2_5_away")
DEFAULT_SUREBET_MARKETS = PHASE_A_MARKETS + PHASE_B_MARKETS

# Phase C — exclusive pairs only (never overlapping DC+DC).
COVERAGE_PAIRS: tuple[dict, ...] = (
    {
        "id": "coverage_dc_1x_vs_away",
        "legs": (("double_chance", "1X"), ("1X2", "away")),
    },
    {
        "id": "coverage_dc_x2_vs_home",
        "legs": (("double_chance", "X2"), ("1X2", "home")),
    },
    {
        "id": "coverage_dc_12_vs_draw",
        "legs": (("double_chance", "12"), ("1X2", "draw")),
    },
)

# Phase D scaffolding — scanned only once odds rows exist under these keys.
PHASE_D_OUTCOME_SETS: dict[str, tuple[str, ...]] = {
    "ah_0": ("home", "away"),
    "ah_home_0_5": ("home", "away"),
    "ah_away_0_5": ("home", "away"),
    "corners_ou_8_5": ("over", "under"),
    "corners_ou_9_5": ("over", "under"),
    "corners_ou_10_5": ("over", "under"),
}

MARKET_OUTCOME_SETS.update(PHASE_D_OUTCOME_SETS)


def scan_arbs(
    db: Session,
    settings: Settings,
    min_profit_pct: Decimal | None = None,
    max_age_minutes: int | None = None,
    sample_stake_ngn: Decimal = Decimal("10000"),
    allowed_bookmakers: set[str] | None = None,
    markets: tuple[str, ...] | None = None,
    include_coverage: bool = False,
) -> dict:
    """
    Scan surebets from stored odds (Phases A–B by default).

    `include_coverage=True` adds Phase C exclusive DC pairs (labeled coverage_*,
    not sold as default surebets).
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
    max_spread = int(getattr(settings, "arb_max_leg_age_spread_minutes", 40) or 40)
    min_books = int(getattr(settings, "arb_min_distinct_books", 2) or 2)
    min_odds = Decimal(str(settings.arb_min_odds))
    max_odds = Decimal(str(settings.arb_max_odds))
    round_to = settings.arb_stake_round_to

    scan_markets = markets if markets is not None else DEFAULT_SUREBET_MARKETS
    scan_markets = tuple(m for m in scan_markets if m in MARKET_OUTCOME_SETS)
    if not scan_markets:
        scan_markets = DEFAULT_SUREBET_MARKETS

    db_markets = _db_markets_for_scan(scan_markets, include_coverage=include_coverage)
    rows = _latest_odds_rows(db, db_markets)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=max_age)

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
        if market == "double_chance":
            raw = str(row["selection"]).strip().upper().replace(" ", "")
            if raw in {"1X", "12", "X2"}:
                selection = raw
            else:
                selection = raw.lower()

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

        for logical in scan_markets:
            needed = MARKET_OUTCOME_SETS.get(logical)
            if not needed:
                continue
            src = MARKET_DB_SOURCE.get(logical, logical)
            selections = markets_map.get(src) or {}
            opp = _opportunity_from_best_legs(
                match=match,
                market=logical,
                needed=needed,
                selections=selections,
                min_profit=min_profit,
                sample_stake_ngn=sample_stake_ngn,
                round_to=round_to,
                now=now,
                min_distinct_books=min_books,
                max_age_spread_minutes=max_spread,
            )
            if opp:
                opportunities.append(opp)

        if include_coverage:
            for pair in COVERAGE_PAIRS:
                opp = _opportunity_from_coverage_pair(
                    match=match,
                    markets_map=markets_map,
                    pair=pair,
                    min_profit=min_profit,
                    sample_stake_ngn=sample_stake_ngn,
                    round_to=round_to,
                    now=now,
                    min_distinct_books=min_books,
                    max_age_spread_minutes=max_spread,
                )
                if opp:
                    opportunities.append(opp)

    opportunities.sort(key=lambda x: x["profit_pct"], reverse=True)
    scanned_list = sorted(books_scanned)
    n = len(opportunities)
    coverage_n = sum(1 for o in opportunities if str(o["market"]).startswith("coverage_"))
    parts = ["1X2", "O/U", "BTTS", "Team totals"]
    if include_coverage:
        parts.append("DC coverage")
    return {
        "count": n,
        "min_profit_pct": min_profit,
        "max_odds_age_minutes": max_age,
        "books_scanned": scanned_list,
        "opportunities": opportunities,
        "include_coverage": include_coverage,
        "coverage_count": coverage_n,
        "message": (
            f"Found {n} surebet{'' if n == 1 else 's'} "
            f"({' · '.join(parts)})."
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
        include_coverage=False,
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


def _db_markets_for_scan(
    logical_markets: tuple[str, ...], *, include_coverage: bool
) -> tuple[str, ...]:
    keys: set[str] = set()
    for m in logical_markets:
        keys.add(MARKET_DB_SOURCE.get(m, m))
    if include_coverage:
        keys.add("double_chance")
        keys.add("1X2")
    return tuple(sorted(keys))


def _latest_odds_rows(db: Session, markets: tuple[str, ...]):
    allowed = [m for m in markets if m]
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
    min_distinct_books: int = 2,
    max_age_spread_minutes: int = 40,
) -> dict | None:
    if not all(sel in selections and selections[sel] for sel in needed):
        return None

    best_legs = [max(selections[sel], key=lambda x: x["odds"]) for sel in needed]
    return _finalize_opportunity(
        match=match,
        market=market,
        best_legs=best_legs,
        min_profit=min_profit,
        sample_stake_ngn=sample_stake_ngn,
        round_to=round_to,
        now=now,
        min_distinct_books=min_distinct_books,
        max_age_spread_minutes=max_age_spread_minutes,
    )


def _opportunity_from_coverage_pair(
    *,
    match: Match,
    markets_map: dict[str, dict[str, list[dict]]],
    pair: dict,
    min_profit: Decimal,
    sample_stake_ngn: Decimal,
    round_to: int,
    now: datetime,
    min_distinct_books: int,
    max_age_spread_minutes: int,
) -> dict | None:
    best_legs: list[dict] = []
    for db_market, selection in pair["legs"]:
        quotes = (markets_map.get(db_market) or {}).get(selection) or []
        if not quotes:
            return None
        best_legs.append(max(quotes, key=lambda x: x["odds"]))

    return _finalize_opportunity(
        match=match,
        market=str(pair["id"]),
        best_legs=best_legs,
        min_profit=min_profit,
        sample_stake_ngn=sample_stake_ngn,
        round_to=round_to,
        now=now,
        min_distinct_books=min_distinct_books,
        max_age_spread_minutes=max_age_spread_minutes,
        product="coverage",
    )


def _finalize_opportunity(
    *,
    match: Match,
    market: str,
    best_legs: list[dict],
    min_profit: Decimal,
    sample_stake_ngn: Decimal,
    round_to: int,
    now: datetime,
    min_distinct_books: int,
    max_age_spread_minutes: int,
    product: str = "surebet",
) -> dict | None:
    books_used = {str(leg["bookmaker"]).lower() for leg in best_legs}
    if len(books_used) < max(2, min_distinct_books):
        return None

    ages = [(now - leg["captured_at"]).total_seconds() / 60.0 for leg in best_legs]
    if max(ages) - min(ages) > max_age_spread_minutes:
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
        age_min = ages[i]
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

    warning = (
        "Profit is only locked if ALL legs are placed at these odds "
        "before books change/void them. Refresh odds often."
    )
    if product == "coverage":
        warning = (
            "Coverage pair (DC vs opposite 1X2) — exclusive outcomes only. "
            "Not a classic same-market surebet. " + warning
        )

    return {
        "match_id": match.id,
        "home_team": match.home_team,
        "away_team": match.away_team,
        "competition_code": match.competition_code,
        "kickoff_at": match.kickoff_at,
        "market": market,
        "product": product,
        "profit_pct": profit_pct.quantize(Decimal("0.01")),
        "implied_sum": plan.implied_sum,
        "legs": scan_legs,
        "books_used": sorted(books_used, key=str),
        "sample_total_stake_ngn": plan.total_stake,
        "sample_profit_ngn": plan.profit,
        "sample_legs": sample_legs,
        "warning": warning,
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
