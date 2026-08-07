#!/usr/bin/env python3
"""
Tiny offline demo of surebet math (no API keys / DB needed).

  python scripts/demo_arbitrage_math.py
"""

from pathlib import Path
import sys
from decimal import Decimal

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.arbitrage_math import ArbLeg, calculate_stakes, is_arbitrage


def main() -> None:
    # Teaching example that IS a surebet (sum of 1/odds < 1).
    # Tweak any price downward to watch the edge disappear.
    legs = [
        ArbLeg("book_a", "1X2", "home", Decimal("2.20")),
        ArbLeg("book_b", "1X2", "draw", Decimal("3.80")),
        ArbLeg("book_c", "1X2", "away", Decimal("4.20")),
    ]
    odds = [leg.odds for leg in legs]
    print("is_arbitrage=", is_arbitrage(odds))
    plan = calculate_stakes(legs, total_stake=Decimal("10000"), round_to=100)
    print("implied_sum=", plan.implied_sum)
    print("total_stake=", plan.total_stake)
    print("guaranteed_return=", plan.guaranteed_return)
    print("profit=", plan.profit, f"({plan.profit_pct}%)")
    for leg, stake in zip(plan.legs, plan.stakes, strict=True):
        print(f"  {leg.bookmaker} {leg.selection} @{leg.odds} → stake ₦{stake}")


if __name__ == "__main__":
    main()
