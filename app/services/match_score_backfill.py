"""
Backfill FINISHED scores onto tip-linked matches.

Odds sync creates match rows (provider=odds-api-io) that stay SCHEDULED forever.
Fixture sync writes separate api-football rows. Auto-settle needs scores on the
row the tip points at — so we fetch finished fixtures and copy scores by
team + kickoff proximity.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Match
from app.providers.api_football import ApiFootballError, ApiFootballProvider
from app.providers.base import FixtureMatch
from app.services.match_store import upsert_fixture

_JUNK_TOKENS = {
    "fc",
    "sc",
    "cf",
    "afc",
    "cfc",
    "united",
    "utd",
    "city",
    "club",
    "de",
    "da",
    "do",
    "the",
    "ii",
}


def _norm_tokens(name: str) -> set[str]:
    s = re.sub(r"[^\w\s]", " ", (name or "").lower())
    return {t for t in s.split() if t and t not in _JUNK_TOKENS}


def _team_score(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    al, bl = a.lower().strip(), b.lower().strip()
    if al == bl:
        return 1.0
    if al in bl or bl in al:
        return 0.92
    ta, tb = _norm_tokens(a), _norm_tokens(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    if inter == 0:
        return 0.0
    return inter / min(len(ta), len(tb))


def _pair_score(home_a: str, away_a: str, home_b: str, away_b: str) -> tuple[float, bool]:
    """Return (score, swapped) — swapped True if home/away are reversed."""
    direct = (_team_score(home_a, home_b) + _team_score(away_a, away_b)) / 2
    swapped = (_team_score(home_a, away_b) + _team_score(away_a, home_b)) / 2
    if swapped > direct:
        return swapped, True
    return direct, False


def _needs_scores(match: Match) -> bool:
    status = (match.status or "").upper()
    if status == "FINISHED" and match.home_score is not None and match.away_score is not None:
        return False
    return True


def _kickoff_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def refresh_scores_for_matches(
    db: Session,
    settings: Settings,
    matches: list[Match],
) -> dict:
    """
    Pull finished fixtures for pending match kickoff dates and patch scores
    onto the given match rows (any provider).
    """
    need = [m for m in matches if m is not None and _needs_scores(m)]
    if not need:
        return {"refreshed": 0, "fetched": 0, "message": "No matches need scores."}

    dates: set[str] = set()
    for m in need:
        ko = _kickoff_utc(m.kickoff_at)
        if ko is None:
            continue
        # Cover timezone edge (kickoff evening UTC vs local calendar day)
        dates.add(ko.date().isoformat())
        dates.add((ko - timedelta(hours=12)).date().isoformat())
        dates.add((ko + timedelta(hours=12)).date().isoformat())

    if not dates:
        return {"refreshed": 0, "fetched": 0, "message": "No kickoff dates to query."}

    try:
        provider = ApiFootballProvider(settings)
        fixtures = provider.fetch_for_dates(sorted(dates), all_leagues=True)
    except ApiFootballError as exc:
        return {
            "refreshed": 0,
            "fetched": 0,
            "message": f"Score refresh skipped: {exc}",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "refreshed": 0,
            "fetched": 0,
            "message": f"Score refresh skipped: {exc}",
        }

    finished = [
        fx
        for fx in fixtures
        if (fx.status or "").upper() == "FINISHED"
        and fx.home_score is not None
        and fx.away_score is not None
    ]

    # Keep api-football rows in sync too (separate from odds-provider tip rows)
    for fx in finished:
        upsert_fixture(db, fx)

    refreshed = 0
    for match in need:
        best_fx: FixtureMatch | None = None
        best_score = 0.0
        best_swapped = False
        m_ko = _kickoff_utc(match.kickoff_at)
        for fx in finished:
            pair, swapped = _pair_score(
                match.home_team, match.away_team, fx.home_team, fx.away_team
            )
            if pair < 0.72:
                continue
            fx_ko = _kickoff_utc(fx.kickoff_at)
            if m_ko and fx_ko:
                hours = abs((m_ko - fx_ko).total_seconds()) / 3600.0
                if hours > 18:
                    continue
                # Prefer closer kickoffs
                pair = pair - min(hours, 6) * 0.01
            if pair > best_score:
                best_score = pair
                best_fx = fx
                best_swapped = swapped

        if best_fx is None:
            continue

        if best_swapped:
            match.home_score = best_fx.away_score
            match.away_score = best_fx.home_score
        else:
            match.home_score = best_fx.home_score
            match.away_score = best_fx.away_score
        match.status = "FINISHED"
        refreshed += 1

    if refreshed:
        db.flush()

    return {
        "refreshed": refreshed,
        "fetched": len(fixtures),
        "finished_candidates": len(finished),
        "message": f"Refreshed scores on {refreshed} match(es) from {len(finished)} finished fixture(s).",
    }
