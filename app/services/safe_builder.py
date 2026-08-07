"""
Safe Builder rules (Phase 3C) — pure functions, no database.

Eric's SportyBet-style rules (risked picks, NOT surebets):

  1) Underdog > 10 (esp. 10–13+) → favourite only inside flex multis
  2) Underdog > 7               → double chance covering the favourite:
         home favourite → 1X (Home or Draw)
         away favourite → X2 (Away or Draw)

  (medium 5–7 band removed for now — too soft / easy to over-trust)

These are heuristics for safer slips — they can still lose.
"""

from dataclasses import dataclass
from decimal import Decimal


@dataclass
class MatchPrices:
    """1X2 decimal odds for one book on one match."""

    home: Decimal
    draw: Decimal
    away: Decimal
    bookmaker: str = ""


@dataclass
class SafePick:
    """One recommended selection from the rules."""

    profile: str
    market: str
    selection: str
    odds: Decimal | None
    rationale: str
    fav_side: str
    fav_odds: Decimal
    dog_side: str
    dog_odds: Decimal
    flex_allow_misses: int | None = None  # e.g. 1 for 9/10 flex


def _sides(prices: MatchPrices) -> tuple[str, Decimal, str, Decimal]:
    """Favourite / underdog among home vs away (draw ignored for fav/dog)."""
    if prices.home <= prices.away:
        return "home", prices.home, "away", prices.away
    return "away", prices.away, "home", prices.home


def double_chance_for_favourite(fav_side: str) -> tuple[str, str]:
    """
    Home fav → 1X (Home or Draw).
    Away fav → X2 (Away or Draw).
    """
    if fav_side == "home":
        return "1X", "Home or Draw"
    return "X2", "Away or Draw"


def evaluate_match(
    prices: MatchPrices,
    *,
    dog_high: Decimal = Decimal("7"),
    dog_flex: Decimal = Decimal("10"),
    fav_max_flex: Decimal = Decimal("1.50"),
) -> SafePick | None:
    """
    Apply Safe Builder rules to one match's 1X2 prices.

    Returns None if the match does not fit any safe profile.
    """
    fav_side, fav_odds, dog_side, dog_odds = _sides(prices)
    dc_sel, dc_label = double_chance_for_favourite(fav_side)

    # --- Extreme underdog → flex accumulator candidate ---
    if dog_odds > dog_flex:
        if fav_odds > fav_max_flex:
            return None
        return SafePick(
            profile="accumulator_flex",
            market="1X2",
            selection=fav_side,
            odds=fav_odds,
            rationale=(
                f"Underdog {dog_side}@{dog_odds} is very long (>{dog_flex}). "
                f"Use favourite {fav_side}@{fav_odds} only inside a multi; "
                f"prefer Flex (e.g. allow 1 miss on a 10-leg slip)."
            ),
            fav_side=fav_side,
            fav_odds=fav_odds,
            dog_side=dog_side,
            dog_odds=dog_odds,
            flex_allow_misses=1,
        )

    # --- High underdog (>7): always double chance (fav side + draw) ---
    if dog_odds > dog_high:
        return SafePick(
            profile="safe_double_chance",
            market="double_chance",
            selection=dc_sel,
            odds=None,  # DC price often not in 1X2 feed; user checks book
            rationale=(
                f"Underdog {dog_side}@{dog_odds} > {dog_high} → "
                f"double chance {dc_sel} ({dc_label}). "
                f"Favourite side is {fav_side}@{fav_odds}; "
                f"covers that team winning or the draw."
            ),
            fav_side=fav_side,
            fav_odds=fav_odds,
            dog_side=dog_side,
            dog_odds=dog_odds,
        )

    return None
