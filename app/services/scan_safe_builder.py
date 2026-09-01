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
from app.services.safe_builder import (
    MatchPrices,
    evaluate_match,
    normalize_pick_market,
)
from app.services.ng_market_filters import is_youth_or_reserve_match
from app.services.tip_learning import (
    build_learning_model,
    enrich_picks_with_learning,
    learning_to_dict,
)


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


def _latest_dc_map(db: Session) -> dict[tuple[int, str, str], Decimal]:
    """(match_id, bookmaker, selection) → latest double_chance price."""
    sql = text(
        """
        SELECT DISTINCT ON (o.match_id, o.bookmaker, o.selection)
            o.match_id,
            o.bookmaker,
            o.selection,
            o.price
        FROM odds o
        WHERE o.market = 'double_chance'
        ORDER BY o.match_id, o.bookmaker, o.selection, o.captured_at DESC
        """
    )
    out: dict[tuple[int, str, str], Decimal] = {}
    for row in db.execute(sql).mappings().all():
        out[
            (
                int(row["match_id"]),
                str(row["bookmaker"]).lower(),
                str(row["selection"]).upper(),
            )
        ] = Decimal(str(row["price"]))
    return out


def scan_safe_picks(
    db: Session,
    settings: Settings,
    *,
    bookmaker: str | None = "sportybet",
    max_age_minutes: int | None = None,
    bankroll_ngn: Decimal = Decimal("50000"),
    unit_pct: Decimal | None = None,
    profiles: set[str] | None = None,
    pick_market: str | None = None,
) -> dict:
    """
    Find matches that fit Safe Builder rules from stored odds.

    Default bookmaker=sportybet (build slips on one book).
    pick_market: double_chance (default) or 1x2.
    """
    mode = normalize_pick_market(pick_market or settings.safe_pick_market)
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
    dc_prices = _latest_dc_map(db)

    picks: list[dict] = []
    for mid, books in by_match.items():
        match = matches.get(mid)
        # Skip kickoffs already started/finished — not placeable as new bets
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
        for book, sels in books.items():
            if not {"home", "draw", "away"} <= set(sels):
                continue
            prices = MatchPrices(
                home=sels["home"]["price"],
                draw=sels["draw"]["price"],
                away=sels["away"]["price"],
                bookmaker=book,
            )
            # Skip palpable longshots (same ceiling as surebet scan).
            # Free feeds often return 50–100 underdogs that aren't real slips.
            max_odds = Decimal(str(settings.arb_max_odds))
            if (
                prices.home > max_odds
                or prices.draw > max_odds
                or prices.away > max_odds
            ):
                continue
            pick = evaluate_match(
                prices,
                pick_market=mode,
                dog_high=Decimal(str(settings.safe_dog_high)),
                dog_flex=Decimal(str(settings.safe_dog_flex)),
                fav_max_flex=Decimal(str(settings.safe_fav_max_flex)),
            )
            if pick is None:
                continue
            if profiles and pick.profile not in profiles:
                continue

            # Attach real Double Chance price when the feed has it (Phase 10B)
            pick_odds = pick.odds
            if pick.market == "double_chance" and pick_odds is None:
                pick_odds = dc_prices.get((mid, book, pick.selection.upper()))

            stake = stake_for_profile(
                bankroll_ngn,
                pick.profile,
                unit_pct=unit,
                round_to=round_to,
            )
            ret = (
                potential_return(stake, pick_odds)
                if pick_odds is not None
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
                    "odds": pick_odds,
                    "home_odds": prices.home,
                    "draw_odds": prices.draw,
                    "away_odds": prices.away,
                    "fav_side": pick.fav_side,
                    "dog_side": pick.dog_side,
                    "dog_odds": pick.dog_odds,
                    "fav_odds": pick.fav_odds,
                    "pick_market": mode,
                    "rationale": pick.rationale,
                    "flex_allow_misses": pick.flex_allow_misses,
                    "suggested_stake_ngn": stake,
                    "potential_return_ngn": ret,
                    "odds_captured_at": latest_cap,
                }
            )

    # Rank using your won/lost history (statistical learning)
    learning = build_learning_model(db)
    picks = enrich_picks_with_learning(picks, learning)
    learn_dict = learning_to_dict(learning)

    style = "double chance (1X/X2)" if mode == "double_chance" else "1X2 favourite"
    warn = ""
    if (
        mode == "1x2"
        and learning.preferred_pick_market == "double_chance"
        and learning.settled >= 3
    ):
        warn = " History prefers double chance — 1X2 is your override."

    return {
        "count": len(picks),
        "bankroll_ngn": bankroll_ngn,
        "unit_pct": unit,
        "bookmaker": bookmaker,
        "pick_market": mode,
        "learning": learn_dict,
        "message": (
            f"Safe Builder ({style}) found {len(picks)} pick(s) on "
            f"{bookmaker or 'all books'}; ranked by your tip history.{warn}"
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
    pick_market: str | None = None,
) -> dict:
    """Evaluate pasted 1X2 odds (no DB) — good for learning / dashboard calc."""
    mode = normalize_pick_market(pick_market or settings.safe_pick_market)
    unit = (
        unit_pct
        if unit_pct is not None
        else Decimal(str(settings.bankroll_unit_pct))
    )
    pick = evaluate_match(
        MatchPrices(home=home, draw=draw, away=away, bookmaker=bookmaker),
        pick_market=mode,
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
