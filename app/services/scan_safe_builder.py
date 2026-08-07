"""
Scan stored 1X2 odds with Safe Builder rules (Phase 3C).
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Match
from app.services.bankroll import potential_return, stake_for_profile
from app.services.safe_builder import MatchPrices, evaluate_match


def _latest_1x2_rows(db: Session):
    sql = text(
        """
        SELECT DISTINCT ON (o.match_id, o.bookmaker, o.market, o.selection)
            o.match_id,
            o.bookmaker,
            o.selection,
            o.price,
            o.captured_at
        FROM odds o
        WHERE o.market = '1X2'
        ORDER BY o.match_id, o.bookmaker, o.market, o.selection, o.captured_at DESC
        """
    )
    return db.execute(sql).mappings().all()


def scan_safe_picks(
    db: Session,
    settings: Settings,
    *,
    bookmaker: str | None = "sportybet",
    max_age_minutes: int | None = None,
    bankroll_ngn: Decimal = Decimal("50000"),
    unit_pct: Decimal | None = None,
    profiles: set[str] | None = None,
) -> dict:
    """
    Find matches that fit Safe Builder rules from stored odds.

    Default bookmaker=sportybet (build slips on one book).
    """
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
    round_to = settings.arb_stake_round_to
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=max_age)

    # match_id → bookmaker → {home/draw/away: price, captured}
    by_match: dict[int, dict[str, dict]] = {}
    for row in _latest_1x2_rows(db):
        captured = row["captured_at"]
        if captured.tzinfo is None:
            captured = captured.replace(tzinfo=timezone.utc)
        if captured < cutoff:
            continue
        book = str(row["bookmaker"]).lower()
        if bookmaker and book != bookmaker.lower():
            continue
        mid = int(row["match_id"])
        by_match.setdefault(mid, {}).setdefault(book, {})
        by_match[mid][book][str(row["selection"]).lower()] = {
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
        for book, sels in books.items():
            if not {"home", "draw", "away"} <= set(sels):
                continue
            prices = MatchPrices(
                home=sels["home"]["price"],
                draw=sels["draw"]["price"],
                away=sels["away"]["price"],
                bookmaker=book,
            )
            pick = evaluate_match(
                prices,
                dog_high=Decimal(str(settings.safe_dog_high)),
                dog_flex=Decimal(str(settings.safe_dog_flex)),
                fav_max_flex=Decimal(str(settings.safe_fav_max_flex)),
            )
            if pick is None:
                continue
            if profiles and pick.profile not in profiles:
                continue

            stake = stake_for_profile(
                bankroll_ngn,
                pick.profile,
                unit_pct=unit,
                round_to=round_to,
            )
            ret = (
                potential_return(stake, pick.odds)
                if pick.odds is not None
                else None
            )
            latest_cap = max(
                sels["home"]["captured_at"],
                sels["draw"]["captured_at"],
                sels["away"]["captured_at"],
            )
            picks.append(
                {
                    "match_id": mid,
                    "home_team": match.home_team if match else "?",
                    "away_team": match.away_team if match else "?",
                    "competition_code": match.competition_code if match else "?",
                    "kickoff_at": match.kickoff_at if match else None,
                    "bookmaker": book,
                    "profile": pick.profile,
                    "market": pick.market,
                    "selection": pick.selection,
                    "odds": pick.odds,
                    "home_odds": prices.home,
                    "draw_odds": prices.draw,
                    "away_odds": prices.away,
                    "fav_side": pick.fav_side,
                    "dog_side": pick.dog_side,
                    "dog_odds": pick.dog_odds,
                    "rationale": pick.rationale,
                    "flex_allow_misses": pick.flex_allow_misses,
                    "suggested_stake_ngn": stake,
                    "potential_return_ngn": ret,
                    "odds_captured_at": latest_cap,
                }
            )

    # Prefer safer profiles first, then shorter fav odds
    rank = {
        "safe_double_chance": 0,
        "accumulator_flex": 1,
    }
    picks.sort(key=lambda p: (rank.get(p["profile"], 9), float(p["dog_odds"])))

    return {
        "count": len(picks),
        "bankroll_ngn": bankroll_ngn,
        "unit_pct": unit,
        "bookmaker": bookmaker,
        "message": (
            f"Safe Builder found {len(picks)} pick(s) on "
            f"{bookmaker or 'all books'} (rules-based, not surebets)."
        ),
        "picks": picks,
    }


def evaluate_prices_dict(
    home: Decimal,
    draw: Decimal,
    away: Decimal,
    settings: Settings,
    *,
    bookmaker: str = "manual",
    bankroll_ngn: Decimal = Decimal("50000"),
    unit_pct: Decimal | None = None,
) -> dict:
    """Evaluate pasted 1X2 odds (no DB) — good for learning / dashboard calc."""
    unit = (
        unit_pct
        if unit_pct is not None
        else Decimal(str(settings.bankroll_unit_pct))
    )
    pick = evaluate_match(
        MatchPrices(home=home, draw=draw, away=away, bookmaker=bookmaker),
        dog_high=Decimal(str(settings.safe_dog_high)),
        dog_flex=Decimal(str(settings.safe_dog_flex)),
        fav_max_flex=Decimal(str(settings.safe_fav_max_flex)),
    )
    if pick is None:
        return {
            "fits_rules": False,
            "message": "No Safe Builder profile matched these odds.",
            "pick": None,
        }
    stake = stake_for_profile(
        bankroll_ngn,
        pick.profile,
        unit_pct=unit,
        round_to=settings.arb_stake_round_to,
    )
    ret = potential_return(stake, pick.odds) if pick.odds is not None else None
    return {
        "fits_rules": True,
        "message": f"Matched profile: {pick.profile}",
        "pick": {
            "bookmaker": bookmaker,
            "profile": pick.profile,
            "market": pick.market,
            "selection": pick.selection,
            "odds": pick.odds,
            "home_odds": home,
            "draw_odds": draw,
            "away_odds": away,
            "fav_side": pick.fav_side,
            "dog_side": pick.dog_side,
            "dog_odds": pick.dog_odds,
            "rationale": pick.rationale,
            "flex_allow_misses": pick.flex_allow_misses,
            "suggested_stake_ngn": stake,
            "potential_return_ngn": ret,
        },
    }
