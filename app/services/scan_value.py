"""
Scan stored 1X2 odds for cross-book value (Phase 5A).

Method (transparent, no ML yet):
  1) Need ≥2 books with fresh full 1X2 on the same match
  2) De-vig each book → average = consensus fair probs
  3) For each selection, take the BEST (highest) price across books
  4) Keep picks where EV% ≥ threshold

Still risked money — log tips and settle to learn if the edge is real.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Match
from app.services.arbitrage_math import looks_like_palpable_error
from app.services.bankroll import potential_return, round_money, unit_stake_ngn
from app.services.value_math import (
    average_fair_probs,
    expected_value_pct,
    fair_odds,
    kelly_fraction,
)


SELECTIONS = ("home", "draw", "away")


def scan_value_1x2(
    db: Session,
    settings: Settings,
    *,
    min_ev_pct: Decimal | None = None,
    max_age_minutes: int | None = None,
    bankroll_ngn: Decimal = Decimal("50000"),
    unit_pct: Decimal | None = None,
    allowed_bookmakers: set[str] | None = None,
    kelly_fraction_cap: Decimal | None = None,
) -> dict:
    min_ev = (
        min_ev_pct
        if min_ev_pct is not None
        else Decimal(str(settings.value_min_ev_pct))
    )
    max_age = (
        max_age_minutes
        if max_age_minutes is not None
        else settings.arb_max_odds_age_minutes
    )
    unit_p = (
        unit_pct
        if unit_pct is not None
        else Decimal(str(settings.bankroll_unit_pct))
    )
    kelly_cap = (
        kelly_fraction_cap
        if kelly_fraction_cap is not None
        else Decimal(str(settings.value_kelly_fraction))
    )
    min_odds = Decimal(str(settings.arb_min_odds))
    max_odds = Decimal(str(settings.arb_max_odds))
    round_to = settings.arb_stake_round_to
    min_books = max(2, int(settings.value_min_books))

    latest_sql = text(
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
    rows = db.execute(latest_sql).mappings().all()

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=max_age)

    # match_id → book → selection → {price, captured_at}
    by_match: dict[int, dict[str, dict[str, dict]]] = {}
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
        sel = str(row["selection"]).lower()
        if sel not in SELECTIONS:
            continue
        mid = int(row["match_id"])
        by_match.setdefault(mid, {}).setdefault(book, {})[sel] = {
            "price": price,
            "captured_at": captured,
        }

    one_unit = unit_stake_ngn(bankroll_ngn, unit_pct=unit_p, round_to=round_to)
    picks: list[dict] = []

    for match_id, books in by_match.items():
        full_books = {
            b: sels
            for b, sels in books.items()
            if all(s in sels for s in SELECTIONS)
        }
        if len(full_books) < min_books:
            continue

        books_odds = [
            [full_books[b][s]["price"] for s in SELECTIONS] for b in full_books
        ]
        try:
            fair_ps = average_fair_probs(books_odds)
        except ValueError:
            continue

        match = db.get(Match, match_id)
        if match is None:
            continue

        for i, sel in enumerate(SELECTIONS):
            candidates = [
                (b, full_books[b][sel]["price"], full_books[b][sel]["captured_at"])
                for b in full_books
            ]
            best_book, best_odds, best_at = max(candidates, key=lambda x: x[1])
            # Soft-book signal: best price must beat at least one other book
            other_prices = [p for b, p, _ in candidates if b != best_book]
            if not other_prices or best_odds <= min(other_prices):
                continue

            fair_p = fair_ps[i]
            ev = expected_value_pct(best_odds, fair_p)
            if ev < min_ev:
                continue

            f_odds = fair_odds(fair_p)
            kelly = kelly_fraction(best_odds, fair_p)
            # Stake = min(1 unit, kelly_cap × bankroll), recreational round
            kelly_stake = round_money(bankroll_ngn * kelly * kelly_cap, round_to)
            stake = min(one_unit, kelly_stake) if kelly_stake > 0 else one_unit
            if stake <= 0:
                stake = one_unit

            age_min = (now - best_at).total_seconds() / 60.0
            warning = (
                "Risked pick — not a surebet. Edge is theoretical vs de-vigged "
                "consensus of your books. Verify live and settle tips to learn."
            )
            if ev >= Decimal("15"):
                warning += " ⚠ EV ≥15% is unusually high — prices may be stale/mismatched."

            book_lines = []
            for b in sorted(full_books):
                prices = ", ".join(
                    f"{s}@{full_books[b][s]['price']}" for s in SELECTIONS
                )
                book_lines.append(f"{b}: {prices}")

            rationale = (
                f"Value {sel} @ {best_odds} on {best_book} | "
                f"fair ~{f_odds} (p={fair_p.quantize(Decimal('0.0001'))}) | "
                f"EV ~{ev}% | books: {'; '.join(book_lines)}"
            )

            picks.append(
                {
                    "match_id": match.id,
                    "home_team": match.home_team,
                    "away_team": match.away_team,
                    "competition_code": match.competition_code,
                    "kickoff_at": match.kickoff_at,
                    "market": "1X2",
                    "selection": sel,
                    "bookmaker": best_book,
                    "odds": best_odds,
                    "fair_odds": f_odds,
                    "fair_prob": fair_p.quantize(Decimal("0.0001")),
                    "ev_pct": ev,
                    "kelly_fraction": kelly,
                    "suggested_stake_ngn": stake,
                    "potential_return_ngn": potential_return(stake, best_odds),
                    "profile": "value_cross_book",
                    "pick_market": "1x2",
                    "books_used": sorted(full_books.keys()),
                    "age_minutes": round(age_min, 1),
                    "rationale": rationale,
                    "warning": warning,
                }
            )

    picks.sort(key=lambda p: p["ev_pct"], reverse=True)

    return {
        "count": len(picks),
        "min_ev_pct": min_ev,
        "max_odds_age_minutes": max_age,
        "bankroll_ngn": bankroll_ngn,
        "unit_pct": unit_p,
        "one_unit_ngn": one_unit,
        "picks": picks,
        "message": (
            f"Found {len(picks)} value pick(s) with EV ≥ {min_ev}% "
            f"using ≥{min_books} books and odds younger than {max_age} min."
            + (
                f" Books filter: {', '.join(sorted(allowed_bookmakers))}."
                if allowed_bookmakers
                else ""
            )
            + " Phase 5A uses cross-book de-vig (not AI models yet)."
        ),
    }
