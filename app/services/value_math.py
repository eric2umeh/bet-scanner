"""
Value / EV math (Phase 5A) — pure functions, no database.

Learning note:
  Book odds include margin (overround). De-vig removes that margin to
  estimate "fair" probabilities. A value bet is when a book's price is
  longer than that fair price:

    EV% = (odds × fair_probability − 1) × 100

  Example:
    Fair P(home) = 0.45  → fair odds ≈ 2.22
    Soft book offers 2.40
    EV = 2.40 × 0.45 − 1 = 0.08 → +8%

  This is NOT a surebet. You can (and will) lose individual value bets.
  Edge only shows up over many settled tips — if the fair model is OK.
"""

from decimal import Decimal, ROUND_HALF_UP

from app.services.arbitrage_math import implied_probability


def multiplicative_devig(odds_list: list[Decimal]) -> list[Decimal]:
    """
    Remove book margin: fair_p_i = (1/o_i) / sum(1/o_j).

    Returns probabilities that sum to 1.
    """
    if len(odds_list) < 2:
        raise ValueError("Need at least 2 outcomes to de-vig")
    implied = [implied_probability(o) for o in odds_list]
    total = sum(implied)
    if total <= 0:
        raise ValueError("Invalid odds for de-vig")
    return [p / total for p in implied]


def average_fair_probs(books_odds: list[list[Decimal]]) -> list[Decimal]:
    """
    Consensus fair probs: average multiplicative de-vig across books.

    books_odds: each inner list is [home, draw, away] (same length).
    """
    if not books_odds:
        raise ValueError("Need at least one book")
    n = len(books_odds[0])
    if n < 2:
        raise ValueError("Need at least 2 outcomes")
    if any(len(row) != n for row in books_odds):
        raise ValueError("All books must have the same number of outcomes")

    acc = [Decimal("0") for _ in range(n)]
    for row in books_odds:
        fair = multiplicative_devig(row)
        for i in range(n):
            acc[i] += fair[i]
    count = Decimal(len(books_odds))
    return [a / count for a in acc]


def fair_odds(fair_p: Decimal) -> Decimal:
    """Convert fair probability → decimal odds."""
    if fair_p <= 0:
        raise ValueError("fair_p must be > 0")
    return (Decimal("1") / fair_p).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def expected_value_pct(odds: Decimal, fair_p: Decimal) -> Decimal:
    """
    Expected value as a percentage of stake.

    Positive ⇒ price is longer than fair (candidate value bet).
    """
    if odds <= 0:
        raise ValueError("odds must be > 0")
    if fair_p <= 0 or fair_p >= 1:
        raise ValueError("fair_p must be between 0 and 1")
    ev = odds * fair_p - Decimal("1")
    return (ev * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def kelly_fraction(odds: Decimal, fair_p: Decimal) -> Decimal:
    """
    Full Kelly fraction of bankroll (capped caller-side).

    f* = (b·p − q) / b  where b = odds−1, q = 1−p
    """
    b = odds - Decimal("1")
    if b <= 0:
        return Decimal("0")
    q = Decimal("1") - fair_p
    raw = (b * fair_p - q) / b
    if raw <= 0:
        return Decimal("0")
    return raw.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
