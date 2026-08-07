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


def show(label: str, prices: MatchPrices, pick_market: str = "double_chance") -> None:
    pick = evaluate_match(prices, pick_market=pick_market)
    print(f"\n=== {label} [pick_market={pick_market}] ===")
    print(f"  1X2: home={prices.home} draw={prices.draw} away={prices.away}")
    if pick is None:
        print("  → no Safe Builder profile")
        return
    print(f"  → profile: {pick.profile}")
    print(f"  → bet: {pick.market} / {pick.selection} @ {pick.odds}")
    print(f"  → {pick.rationale}")


def main() -> None:
    bankroll = Decimal("50000")
    unit = unit_stake_ngn(bankroll, Decimal("1"))
    print(f"Bankroll ₦{bankroll} → 1 unit (1%) = ₦{unit}")

    villa_bayern = MatchPrices(
        home=Decimal("10.5"), draw=Decimal("4.35"), away=Decimal("1.30")
    )
    # Default: double chance even when dog > 10
    show("Villa vs Bayern — DEFAULT", villa_bayern, "double_chance")
    # Optional: straight 1X2 favourite (flex tag when dog > 10)
    show("Villa vs Bayern — user chose 1X2", villa_bayern, "1x2")

    mid = MatchPrices(home=Decimal("1.22"), draw=Decimal("5.5"), away=Decimal("8.2"))
    show("dog 8.2 — DC default", mid, "double_chance")
    show("dog 8.2 — 1X2 choice", mid, "1x2")


if __name__ == "__main__":
    main()
