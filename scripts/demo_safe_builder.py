#!/usr/bin/env python3
"""
Offline demo of Phase 3C Safe Builder + bankroll units (no API keys).

Run:
  python scripts/demo_safe_builder.py
"""

from pathlib import Path
import sys
from decimal import Decimal

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.bankroll import stake_for_profile, unit_stake_ngn
from app.services.safe_builder import MatchPrices, evaluate_match


def show(label: str, prices: MatchPrices) -> None:
    pick = evaluate_match(prices)
    print(f"\n=== {label} ===")
    print(f"  1X2: home={prices.home} draw={prices.draw} away={prices.away}")
    if pick is None:
        print("  → no Safe Builder profile")
        return
    print(f"  → profile: {pick.profile}")
    print(f"  → bet: {pick.market} / {pick.selection} @ {pick.odds}")
    print(f"  → {pick.rationale}")
    if pick.flex_allow_misses:
        print(f"  → flex: allow {pick.flex_allow_misses} miss(es)")


def main() -> None:
    bankroll = Decimal("50000")
    unit = unit_stake_ngn(bankroll, Decimal("1"))
    print(f"Bankroll ₦{bankroll} → 1 unit (1%) = ₦{unit}")
    for profile in (
        "safe_favourite",
        "safe_double_chance",
        "medium_underdog",
        "accumulator_flex",
    ):
        print(f"  {profile}: ₦{stake_for_profile(bankroll, profile)}")

    # Rule 1: dog between 7 and 10, fav <1.30 → straight fav
    # (dog >10 is handled by accumulator_flex first)
    show(
        "safe favourite (dog 8.2, fav 1.22)",
        MatchPrices(home=Decimal("1.22"), draw=Decimal("5.5"), away=Decimal("8.2")),
    )
    # Rule 2: dog >7, fav too high → DC
    show(
        "safe double chance (dog 8.5, fav 1.55)",
        MatchPrices(home=Decimal("1.55"), draw=Decimal("4.0"), away=Decimal("8.5")),
    )
    # Rule 3: dog 5–7 medium
    show(
        "medium underdog (dog 6.2, fav 1.40)",
        MatchPrices(home=Decimal("1.40"), draw=Decimal("4.2"), away=Decimal("6.2")),
    )
    # Rule 4: dog >10 flex multi
    show(
        "accumulator flex (dog 12, fav 1.22)",
        MatchPrices(home=Decimal("12"), draw=Decimal("6.5"), away=Decimal("1.22")),
    )
    # No match
    show(
        "skip (balanced 2.10 / 3.20 / 3.40)",
        MatchPrices(home=Decimal("2.10"), draw=Decimal("3.20"), away=Decimal("3.40")),
    )


if __name__ == "__main__":
    main()
