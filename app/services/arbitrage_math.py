"""
Arbitrage (surebet) math — pure functions, no database.

Learning note (the core idea):
  If you bet EVERY possible outcome across different bookmakers,
  and the sum of implied probabilities is < 1.0, you lock a profit
  no matter which outcome wins — IF both/all legs are placed at those odds.

  Implied probability for decimal odds O is:  1 / O

  Example (2-way):
    Book A: Over 2.5 @ 2.10   → 1/2.10 = 0.476
    Book B: Under 2.5 @ 2.05  → 1/2.05 = 0.488
    Sum = 0.964 < 1.0  → ~3.6% edge (before staking)

  Soccer 1X2 needs THREE legs (home + draw + away).

IMPORTANT: Math ≠ real life.
  Odds move, books void typos, accounts get limited.
  Always show freshness + round stakes.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


@dataclass
class ArbLeg:
    """One side of a surebet (one bookmaker + one selection)."""

    bookmaker: str
    market: str
    selection: str
    odds: Decimal


@dataclass
class StakePlan:
    """How much to put on each leg for a given total bankroll."""

    legs: list[ArbLeg]
    stakes: list[Decimal]          # same order as legs
    total_stake: Decimal
    guaranteed_return: Decimal     # what you get back whichever outcome wins
    profit: Decimal
    profit_pct: Decimal            # profit / total_stake * 100
    implied_sum: Decimal           # sum(1/odds); arb if < 1


def implied_probability(odds: Decimal) -> Decimal:
    """Convert decimal odds → implied probability."""
    if odds <= 0:
        raise ValueError("Odds must be > 0")
    return Decimal("1") / odds


def is_arbitrage(odds_list: list[Decimal]) -> bool:
    """True when covering all outcomes costs less than ₦1 of liability."""
    return sum(implied_probability(o) for o in odds_list) < Decimal("1")


def arbitrage_profit_pct(odds_list: list[Decimal]) -> Decimal:
    """
    Theoretical ROI % if you stake optimally.

    profit_pct = (1 / sum(1/o_i) - 1) * 100
    """
    implied = sum(implied_probability(o) for o in odds_list)
    if implied <= 0:
        raise ValueError("Invalid odds")
    return (Decimal("1") / implied - Decimal("1")) * Decimal("100")


def round_money(amount: Decimal, round_to: int = 100) -> Decimal:
    """
    Round stake to nearest Naira step (default ₦100).

    Why? Bookies limit 'robot-looking' stakes like ₦4523.17.
    Recreational-looking round numbers blend in better.
    """
    if round_to <= 0:
        return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    step = Decimal(round_to)
    # Round to nearest multiple of step
    return (amount / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step


def calculate_stakes(
    legs: list[ArbLeg],
    total_stake: Decimal,
    round_to: int = 100,
) -> StakePlan:
    """
    Split total_stake across legs so every outcome returns ~the same amount.

    Formula for leg i:
      stake_i = total * (1/odds_i) / sum(1/odds_j)

    After rounding, we recompute profit from the WORST payout
    (honest number after ₦100 rounding).
    """
    if total_stake <= 0:
        raise ValueError("total_stake must be > 0")
    if len(legs) < 2:
        raise ValueError("Need at least 2 legs")

    odds_list = [leg.odds for leg in legs]
    implied_list = [implied_probability(o) for o in odds_list]
    implied_sum = sum(implied_list)

    raw_stakes = [
        total_stake * (imp / implied_sum) for imp in implied_list
    ]
    stakes = [round_money(s, round_to=round_to) for s in raw_stakes]

    # If rounding made everything 0, fall back to unrounded cents
    if all(s <= 0 for s in stakes):
        stakes = [
            s.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for s in raw_stakes
        ]

    actual_total = sum(stakes)
    # Each outcome pays stake_i * odds_i; after rounding these differ slightly.
    payouts = [stakes[i] * odds_list[i] for i in range(len(legs))]
    guaranteed_return = min(payouts)
    profit = guaranteed_return - actual_total
    profit_pct = (
        (profit / actual_total) * Decimal("100")
        if actual_total > 0
        else Decimal("0")
    )

    return StakePlan(
        legs=legs,
        stakes=stakes,
        total_stake=actual_total,
        guaranteed_return=guaranteed_return.quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        ),
        profit=profit.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        profit_pct=profit_pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        implied_sum=implied_sum.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
    )


def looks_like_palpable_error(
    odds: Decimal,
    min_odds: Decimal = Decimal("1.01"),
    max_odds: Decimal = Decimal("15"),
) -> bool:
    """
    Filter crazy prices (e.g. 21.0 typo instead of 2.10).

    Books often VOID these — leaving you exposed on the other leg.
    """
    return odds < min_odds or odds > max_odds
