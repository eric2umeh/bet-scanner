"""
Settle tips from match scores (Phase 4).

1X2: home / draw / away
double_chance: 1X (Home or Draw), X2 (Away or Draw), 12 (Home or Away)
"""

from __future__ import annotations


def selection_won(
    market: str,
    selection: str,
    home_score: int,
    away_score: int,
) -> bool | None:
    """
    Return True/False if we can judge the tip; None if market/selection unknown.
    """
    market = market.lower().strip()
    selection = selection.lower().strip()

    if market in ("1x2", "match_result"):
        if selection == "home":
            return home_score > away_score
        if selection == "away":
            return away_score > home_score
        if selection == "draw":
            return home_score == away_score
        return None

    if market in ("double_chance", "dc"):
        if selection == "1x":
            return home_score >= away_score  # home win or draw
        if selection == "x2":
            return away_score >= home_score  # away win or draw
        if selection == "12":
            return home_score != away_score
        return None

    return None
