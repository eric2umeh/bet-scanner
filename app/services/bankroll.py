"""
Bankroll / unit sizing (Phase 3C) — pure functions, no database.

Learning note:
  A unit is a small fixed % of your bankroll (e.g. 1% of ₦50,000 = ₦500).
  Safe Builder uses units so one bad day does not wipe the account.
"""

from decimal import Decimal, ROUND_HALF_UP


def round_money(amount: Decimal, round_to: int = 100) -> Decimal:
    """Round Naira to nearest round_to (default ₦100)."""
    if round_to <= 0:
        return amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    step = Decimal(round_to)
    return (amount / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step


def unit_stake_ngn(
    bankroll_ngn: Decimal,
    unit_pct: Decimal = Decimal("1"),
    round_to: int = 100,
) -> Decimal:
    """
    One unit = unit_pct% of bankroll.

    Example: bankroll 50_000, unit_pct 1 → ₦500.
    """
    if bankroll_ngn <= 0:
        raise ValueError("bankroll_ngn must be > 0")
    if unit_pct <= 0:
        raise ValueError("unit_pct must be > 0")
    raw = bankroll_ngn * unit_pct / Decimal("100")
    return round_money(raw, round_to)


def stake_for_profile(
    bankroll_ngn: Decimal,
    profile: str,
    unit_pct: Decimal = Decimal("1"),
    round_to: int = 100,
    units_by_profile: dict[str, Decimal] | None = None,
) -> Decimal:
    """
    Suggested stake for a Safe Builder profile (in Naira).

    Default multipliers (in units):
      safe_double_chance → 1.0 unit
      accumulator_flex   → 0.5 unit (per multi slip, not per leg)
    """
    defaults: dict[str, Decimal] = {
        "safe_double_chance": Decimal("1"),
        "accumulator_flex": Decimal("0.5"),
    }
    table = {**defaults, **(units_by_profile or {})}
    units = table.get(profile, Decimal("1"))
    one = unit_stake_ngn(bankroll_ngn, unit_pct=unit_pct, round_to=round_to)
    return round_money(one * units, round_to)


def potential_return(stake: Decimal, odds: Decimal) -> Decimal:
    """Stake × decimal odds (includes stake back)."""
    return (stake * odds).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
