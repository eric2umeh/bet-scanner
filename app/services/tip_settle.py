"""
Settle tips from match scores (Phase 4 + 10B).

1X2: home / draw / away
double_chance: 1X (Home or Draw), X2 (Away or Draw), 12 (Home or Away)
ou_0_5 / ou_1_5 / ou_2_5: over / under vs that line
btts: yes / no (both teams scored)
tt_2_5: home_over / away_over (team scores 3+)
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

    ou_lines = {
        "ou_0_5": 0.5,
        "ou05": 0.5,
        "ou_1_5": 1.5,
        "ou15": 1.5,
        "ou_2_5": 2.5,
        "ou25": 2.5,
        "over_under_2_5": 2.5,
        "totals_2_5": 2.5,
    }
    if market in ou_lines:
        line = ou_lines[market]
        if selection in ("over", "o") or selection.startswith("over"):
            return total > line
        if selection in ("under", "u") or selection.startswith("under"):
            return total < line
        return None

    if market in ("btts", "both_teams_to_score", "gg"):
        both = home_score > 0 and away_score > 0
        if selection in ("yes", "y", "gg"):
            return both
        if selection in ("no", "n", "ng"):
            return not both
        return None

    if market in ("tt_2_5", "team_total_2_5", "team_goals_3"):
        # Over 2.5 team goals = that side scores 3+.
        if selection in ("home_over", "home", "1"):
            return home_score > 2.5
        if selection in ("away_over", "away", "2"):
            return away_score > 2.5
        if selection in ("home_under",):
            return home_score < 2.5
        if selection in ("away_under",):
            return away_score < 2.5
        return None

    return None
