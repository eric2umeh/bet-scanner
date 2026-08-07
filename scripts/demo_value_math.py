#!/usr/bin/env python3
"""Quick demo of Phase 5A de-vig / EV math (no database)."""

from decimal import Decimal
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.value_math import (
    average_fair_probs,
    expected_value_pct,
    fair_odds,
    multiplicative_devig,
)


def main() -> None:
    sporty = [Decimal("2.10"), Decimal("3.40"), Decimal("3.50")]
    bet9ja = [Decimal("1.95"), Decimal("3.50"), Decimal("4.20")]

    print("SportyBet de-vig:", [str(p.quantize(Decimal("0.0001"))) for p in multiplicative_devig(sporty)])
    print("Bet9ja de-vig:   ", [str(p.quantize(Decimal("0.0001"))) for p in multiplicative_devig(bet9ja)])

    fair = average_fair_probs([sporty, bet9ja])
    labels = ("home", "draw", "away")
    print("\nConsensus fair:")
    for i, lab in enumerate(labels):
        print(f"  {lab}: p={fair[i].quantize(Decimal('0.0001'))}  odds~{fair_odds(fair[i])}")

    print("\nBest price EV:")
    for i, lab in enumerate(labels):
        best = max(sporty[i], bet9ja[i])
        book = "sportybet" if sporty[i] >= bet9ja[i] else "bet9ja"
        ev = expected_value_pct(best, fair[i])
        print(f"  {lab} @ {best} ({book}) → EV {ev}%")


if __name__ == "__main__":
    main()
