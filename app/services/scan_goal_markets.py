"""
Goal-market lean tips from stored odds.

Markets:
  - ou_0_5 / ou_1_5 / ou_2_5 (match totals)
  - btts
  - tt_2_5 (team totals over 2.5 ≈ team scores 3+)

Win-rate focus (research / recreational practice):
  - Over 0.5 and Over 1.5 hit more often than Over 2.5 in most leagues.
  - Under 0.5 (0-0) is rare — we skip Under 0.5.
  - Team over 2.5 (3+ goals by one side) is a longshot — only show when heavily short.
  - These still follow the *shorter* book price (market lean), not a Poisson model.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Match
from app.services.bankroll import potential_return, unit_stake_ngn
from app.services.ng_market_filters import is_youth_or_reserve_match, singles_only_hint

GOAL_MARKETS = ("ou_0_5", "ou_1_5", "ou_2_5", "btts", "tt_2_5")


def _latest_rows(db: Session, markets: tuple[str, ...]):
    allowed = set(GOAL_MARKETS)
    clean = [m for m in markets if m in allowed]
    if not clean:
        return []
    in_list = ", ".join(f"'{m}'" for m in clean)
    sql = text(
        f"""
        SELECT DISTINCT ON (o.match_id, o.bookmaker, o.market, o.selection)
            o.match_id,
            o.bookmaker,
            o.market,
            o.selection,
            o.price,
            o.captured_at
        FROM odds o
        WHERE o.market IN ({in_list})
        ORDER BY o.match_id, o.bookmaker, o.market, o.selection, o.captured_at DESC
        """
    )
    return db.execute(sql).mappings().all()


def scan_goal_market_picks(
    db: Session,
    settings: Settings,
    *,
    bookmaker: str | None = "sportybet",
    max_age_minutes: int | None = None,
    bankroll_ngn: Decimal = Decimal("50000"),
    unit_pct: Decimal | None = None,
    markets: set[str] | None = None,
) -> dict:
    """
    Build lean tips for goal markets.

    Default: ou_0_5, ou_1_5, ou_2_5, btts, tt_2_5.
    """
    wanted = markets or set(GOAL_MARKETS)
    max_age = (
        max_age_minutes
        if max_age_minutes is not None
        else settings.arb_max_odds_age_minutes
    )
    unit = (
        unit_pct
        if unit_pct is not None
        else Decimal(str(settings.bankroll_unit_pct))
    )
    stake = unit_stake_ngn(
        bankroll_ngn, unit, round_to=settings.arb_stake_round_to
    )
    max_odds = Decimal(str(settings.arb_max_odds))
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=max_age)
    min_lean = float(getattr(settings, "goal_lean_min_confidence", 60.0))

    by_match: dict[int, dict[str, dict[str, dict]]] = {}
    for row in _latest_rows(db, GOAL_MARKETS):
        captured = row["captured_at"]
        if captured.tzinfo is None:
            captured = captured.replace(tzinfo=timezone.utc)
        if captured < cutoff:
            continue
        book = str(row["bookmaker"]).lower()
        if bookmaker and book != bookmaker.lower():
            continue
        mid = int(row["match_id"])
        market = str(row["market"])
        if market not in wanted:
            continue
        by_match.setdefault(mid, {}).setdefault(book, {}).setdefault(market, {})[
            str(row["selection"]).lower()
        ] = {
            "price": Decimal(str(row["price"])),
            "captured_at": captured,
        }

    match_ids = list(by_match.keys())
    matches: dict[int, Match] = {}
    if match_ids:
        matches = {
            m.id: m
            for m in db.scalars(select(Match).where(Match.id.in_(match_ids))).all()
        }

    picks: list[dict] = []
    for mid, books in by_match.items():
        match = matches.get(mid)
        if match is not None and match.kickoff_at is not None:
            ko = match.kickoff_at
            if ko.tzinfo is None:
                ko = ko.replace(tzinfo=timezone.utc)
            if ko <= now:
                continue
        if match is not None and is_youth_or_reserve_match(
            match.home_team,
            match.away_team,
            competition_code=match.competition_code,
            competition_name=match.competition_name,
        ):
            continue
        for book, mkts in books.items():
            for market_key in ("ou_0_5", "ou_1_5", "ou_2_5"):
                if market_key not in wanted or market_key not in mkts:
                    continue
                pick = _lean_two_way(
                    mkts[market_key],
                    market=market_key,
                    label_a="over",
                    label_b="under",
                    profile=f"market_lean_{market_key}",
                    max_odds=max_odds,
                )
                if pick and _keep_ou_pick(pick, market_key) and float(pick.get("confidence_pct") or 0) >= min_lean:
                    picks.append(
                        _pack_pick(mid, match, book, pick, stake, bankroll_ngn=bankroll_ngn)
                    )

            if "btts" in wanted and "btts" in mkts:
                pick = _lean_two_way(
                    mkts["btts"],
                    market="btts",
                    label_a="yes",
                    label_b="no",
                    profile="market_lean_btts",
                    max_odds=max_odds,
                )
                if pick and float(pick.get("confidence_pct") or 0) >= min_lean:
                    picks.append(
                        _pack_pick(mid, match, book, pick, stake, bankroll_ngn=bankroll_ngn)
                    )

            if "tt_2_5" in wanted and "tt_2_5" in mkts:
                for side in ("home", "away"):
                    over_k = f"{side}_over"
                    under_k = f"{side}_under"
                    if over_k not in mkts["tt_2_5"] or under_k not in mkts["tt_2_5"]:
                        continue
                    pick = _lean_two_way(
                        {
                            "over": mkts["tt_2_5"][over_k],
                            "under": mkts["tt_2_5"][under_k],
                        },
                        market="tt_2_5",
                        label_a="over",
                        label_b="under",
                        profile="market_lean_tt",
                        max_odds=max_odds,
                    )
                    if not pick:
                        continue
                    # Only show team scores 3+ when Over is the short side and lean is strong.
                    if pick["selection"] != "over":
                        continue
                    if float(pick.get("confidence_pct") or 0) < max(min_lean, 66.0):
                        continue
                    pick = {
                        **pick,
                        "selection": over_k,
                        "rationale": (
                            f"Team totals: {side} Over 2.5 (scores 3+) @"
                            f"{pick['odds']} looks shorter than Under. Longshot — verify live."
                        ),
                    }
                    picks.append(
                        _pack_pick(mid, match, book, pick, stake, bankroll_ngn=bankroll_ngn)
                    )

    # Prefer higher-hit lines first (0.5 / 1.5 over 2.5 / BTTS / team 3+)
    rank = {"ou_0_5": 0, "ou_1_5": 1, "ou_2_5": 2, "btts": 3, "tt_2_5": 4}
    picks.sort(
        key=lambda p: (
            rank.get(str(p.get("market")), 9),
            -float(p.get("confidence_pct") or 0),
        )
    )

    return {
        "count": len(picks),
        "bankroll_ngn": bankroll_ngn,
        "unit_pct": unit,
        "bookmaker": bookmaker,
        "message": (
            f"Goal markets found {len(picks)} tip(s) on "
            f"{bookmaker or 'all books'} (O/U 0.5·1.5·2.5, BTTS, team 3+)."
        ),
        "picks": picks,
    }


def _keep_ou_pick(pick: dict, market: str) -> bool:
    """
    Bias toward higher historical hit-rate styles.

    - ou_0_5: only Over (Under 0.5 = clean sheet 0-0, rare / low hit for "safe")
    - ou_1_5 / ou_2_5: keep Over or Under when that side is shorter
    """
    sel = str(pick.get("selection") or "").lower()
    if market == "ou_0_5":
        return sel == "over"
    return sel in {"over", "under"}


def _lean_two_way(
    sels: dict,
    *,
    market: str,
    label_a: str,
    label_b: str,
    profile: str,
    max_odds: Decimal,
) -> dict | None:
    if label_a not in sels or label_b not in sels:
        return None
    pa = sels[label_a]["price"]
    pb = sels[label_b]["price"]
    if pa <= 1 or pb <= 1:
        return None
    if pa > max_odds or pb > max_odds:
        return None
    if pa <= pb:
        selection, price, other, other_price = label_a, pa, label_b, pb
    else:
        selection, price, other, other_price = label_b, pb, label_a, pa
    captured = max(sels[label_a]["captured_at"], sels[label_b]["captured_at"])
    return {
        "profile": profile,
        "market": market,
        "selection": selection,
        "odds": price,
        "other_selection": other,
        "other_odds": other_price,
        "rationale": (
            f"Market lean on {market}: {selection}@{price} is shorter than "
            f"{other}@{other_price}. Verify live — not a guarantee."
        ),
        "odds_captured_at": captured,
        "pick_market": market,
        "confidence_pct": _confidence(pa, pb),
        "confidence_label": "market lean",
    }


def _confidence(a: Decimal, b: Decimal) -> float:
    """Display-only: bigger odds gap → higher lean score (not win probability)."""
    lo, hi = (a, b) if a <= b else (b, a)
    if lo <= 0:
        return 50.0
    gap = float((hi - lo) / lo)
    return round(min(78.0, 52.0 + gap * 40.0), 1)


def _pack_pick(
    mid: int,
    match: Match | None,
    book: str,
    pick: dict,
    stake: Decimal,
    *,
    bankroll_ngn: Decimal,
) -> dict:
    ret = potential_return(stake, pick["odds"]) if pick.get("odds") else None
    hint = None
    if match is not None:
        hint = singles_only_hint(
            match.home_team,
            match.away_team,
            competition_code=match.competition_code,
            competition_name=match.competition_name,
        )
    return {
        "match_id": mid,
        "home_team": match.home_team if match else "?",
        "away_team": match.away_team if match else "?",
        "competition_code": match.competition_code if match else "?",
        "kickoff_at": match.kickoff_at if match else None,
        "bookmaker": book,
        "profile": pick["profile"],
        "market": pick["market"],
        "selection": pick["selection"],
        "odds": pick["odds"],
        "rationale": pick["rationale"],
        "suggested_stake_ngn": stake,
        "potential_return_ngn": ret,
        "bankroll_ngn": bankroll_ngn,
        "odds_captured_at": pick.get("odds_captured_at"),
        "pick_market": pick.get("pick_market"),
        "confidence_pct": pick.get("confidence_pct"),
        "confidence_label": pick.get("confidence_label"),
        "warning": hint,
    }
