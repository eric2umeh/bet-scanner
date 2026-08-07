"""
Safe Builder rules (Phase 3C) — pure functions, no database.

When underdog odds > 7 (home/away):

  Default pick_market = double_chance
    home favourite → 1X (Home or Draw)
    away favourite → X2 (Away or Draw)

  Optional pick_market = 1x2
    → straight favourite (home or away)
    → if underdog > 10, tagged accumulator_flex (prefer flex multi)

User chooses the market style; rules still require underdog > 7.
These are heuristics for safer slips — they can still lose.
"""

from dataclasses import dataclass
from decimal import Decimal

PICK_DOUBLE_CHANCE = "double_chance"
PICK_1X2 = "1x2"


def normalize_pick_market(value: str | None) -> str:
    """Return 'double_chance' (default) or '1x2'."""
    raw = (value or PICK_DOUBLE_CHANCE).strip().lower().replace("-", "_")
    if raw in ("1x2", "one_x_two", "onextwo", "match_result", "straight"):
        return PICK_1X2
    return PICK_DOUBLE_CHANCE


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
    pick_market: str = PICK_DOUBLE_CHANCE,
    dog_high: Decimal = Decimal("7"),
    dog_flex: Decimal = Decimal("10"),
    fav_max_flex: Decimal = Decimal("1.50"),
) -> SafePick | None:
    """
    Apply Safe Builder rules to one match's 1X2 prices.

    pick_market:
      double_chance (default) → 1X / X2
      1x2                     → straight favourite
    """
    mode = normalize_pick_market(pick_market)
    fav_side, fav_odds, dog_side, dog_odds = _sides(prices)
    dc_sel, dc_label = double_chance_for_favourite(fav_side)

    if dog_odds <= dog_high:
        return None

    # --- User chose double chance (default, including dog > 10) ---
    if mode == PICK_DOUBLE_CHANCE:
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

    # --- User chose 1X2 straight favourite ---
    if dog_odds > dog_flex:
        if fav_odds > fav_max_flex:
            return None
        return SafePick(
            profile="accumulator_flex",
            market="1X2",
            selection=fav_side,
            odds=fav_odds,
            rationale=(
                f"Pick style 1X2 + underdog {dog_side}@{dog_odds} > {dog_flex}. "
                f"Use favourite {fav_side}@{fav_odds} only inside a multi; "
                f"prefer Flex (e.g. allow 1 miss on a 10-leg slip)."
            ),
            fav_side=fav_side,
            fav_odds=fav_odds,
            dog_side=dog_side,
            dog_odds=dog_odds,
            flex_allow_misses=1,
        )

    return SafePick(
        profile="safe_favourite",
        market="1X2",
        selection=fav_side,
        odds=fav_odds,
        rationale=(
            f"Pick style 1X2 + underdog {dog_side}@{dog_odds} > {dog_high} → "
            f"straight favourite {fav_side}@{fav_odds}."
        ),
        fav_side=fav_side,
        fav_odds=fav_odds,
        dog_side=dog_side,
        dog_odds=dog_odds,
    )
