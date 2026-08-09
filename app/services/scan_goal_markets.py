"""
Phase 10B — O/U 2.5 and BTTS lean tips from stored odds.

Honest framing: these follow the *shorter* (favourite) side of each market
on one book — not a guarantee. Engines decide; you verify live.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Match
from app.services.bankroll import potential_return, unit_stake_ngn


def _latest_rows(db: Session, markets: tuple[str, ...]):
    # Inline IN list — markets are fixed app constants, not user input
    allowed = {"ou_2_5", "btts"}
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
    Build lean tips for ou_2_5 and/or btts.

    markets: {"ou_2_5", "btts"} — default both.
    """
    wanted = markets or {"ou_2_5", "btts"}
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

    # match → book → market → selection → {price, captured}
    by_match: dict[int, dict[str, dict[str, dict]]] = {}
    for row in _latest_rows(db, ("ou_2_5", "btts")):
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
        for book, mkts in books.items():
            if "ou_2_5" in wanted and "ou_2_5" in mkts:
                pick = _lean_two_way(
                    mkts["ou_2_5"],
                    market="ou_2_5",
                    label_a="over",
                    label_b="under",
                    profile="market_lean_ou",
                    max_odds=max_odds,
                )
                if pick:
                    picks.append(
                        _pack_pick(
                            mid, match, book, pick, stake, bankroll_ngn=bankroll_ngn
                        )
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
                if pick:
                    picks.append(
                        _pack_pick(
                            mid, match, book, pick, stake, bankroll_ngn=bankroll_ngn
                        )
                    )

    return {
        "count": len(picks),
        "bankroll_ngn": bankroll_ngn,
        "unit_pct": unit,
        "bookmaker": bookmaker,
        "message": (
            f"Goal markets found {len(picks)} lean tip(s) on "
            f"{bookmaker or 'all books'} (favourite side of O/U 2.5 / BTTS)."
        ),
        "picks": picks,
    }


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
    if pa > max_odds or pb > max_odds:
        return None
    # Shorter price = market favourite
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
    """Bigger gap between sides → slightly higher (capped) confidence display."""
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
        "dog_odds": pick.get("other_odds"),
        "fav_odds": pick["odds"],
        "fav_side": pick["selection"],
        "dog_side": pick.get("other_selection"),
        "pick_market": pick["pick_market"],
        "rationale": pick["rationale"],
        "suggested_stake_ngn": stake,
        "potential_return_ngn": ret,
        "odds_captured_at": pick["odds_captured_at"],
        "confidence_pct": pick["confidence_pct"],
        "confidence_label": pick["confidence_label"],
        "home_odds": None,
        "draw_odds": None,
        "away_odds": None,
    }
