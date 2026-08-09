"""
Settle tips from match scores (Phase 4 + 10B).

1X2: home / draw / away
double_chance: 1X (Home or Draw), X2 (Away or Draw), 12 (Home or Away)
ou_2_5: over / under (total goals vs 2.5)
btts: yes / no (both teams scored)
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
    market = market.lower().strip().replace("-", "_")
    selection = selection.lower().strip()
    total = home_score + away_score

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

    if market in ("ou_2_5", "ou25", "over_under_2_5", "totals_2_5"):
        if selection in ("over", "o", "over_2_5"):
            return total > 2.5
        if selection in ("under", "u", "under_2_5"):
            return total < 2.5
        return None

    if market in ("btts", "both_teams_to_score", "gg"):
        both = home_score > 0 and away_score > 0
        if selection in ("yes", "y", "gg"):
            return both
        if selection in ("no", "n", "ng"):
            return not both
        return None

    return None
