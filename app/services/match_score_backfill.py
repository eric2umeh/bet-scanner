"""
Backfill FINISHED scores onto tip-linked matches.

Odds sync creates match rows (provider=odds-api-io) that stay SCHEDULED forever.
Fixture sync writes separate api-football rows. Auto-settle needs scores on the
row the tip points at — so we fetch finished fixtures and copy scores by
team + kickoff proximity.

Primary source: API-Football (all leagues by date).
Fallback when API-Football fails or returns no finished rows: odds-api.io
(settled /events + optional historical team search).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Match
from app.providers.api_football import ApiFootballError, ApiFootballProvider
from app.providers.base import FixtureMatch
from app.providers.odds_api_io import OddsApiIoError, OddsApiIoProvider
from app.services.match_status import VOIDABLE_MATCH_STATUSES, normalize_match_status

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

_MAX_SEARCH_FALLBACK = 80
_MAX_SETTLED_FETCH_DAYS = 21
_PAIR_MIN = 0.55


def _fixture_could_match_need(match: Match, fx: FixtureMatch) -> bool:
    pair, _ = _pair_score(match.home_team, match.away_team, fx.home_team, fx.away_team)
    if pair < _PAIR_MIN:
        return False
    m_ko = _kickoff_utc(match.kickoff_at)
    fx_ko = _kickoff_utc(fx.kickoff_at)
    if m_ko and fx_ko:
        hours = abs((m_ko - fx_ko).total_seconds()) / 3600.0
        if hours > 48:
            return False
    return True


def _filter_finished_for_need(need: list[Match], finished: list[FixtureMatch]) -> list[FixtureMatch]:
    """Keep only finished rows that might match a pending tip — avoids scanning thousands."""
    if not need or not finished:
        return finished
    out: list[FixtureMatch] = []
    for fx in finished:
        if any(_fixture_could_match_need(m, fx) for m in need):
            out.append(fx)
    return out


def _date_windows(dates: set[str]) -> list[tuple[datetime, datetime]]:
    """
    Cover the full kickoff span in ≤21-day chunks.

    Older code clamped to the *start* of the range and dropped recent days when
    pending tips spanned more than 21 days — that left finished matches unsettled.
    """
    if not dates:
        return []
    start, end = _date_window(dates)
    max_span = timedelta(days=_MAX_SETTLED_FETCH_DAYS)
    windows: list[tuple[datetime, datetime]] = []
    cur = start
    while cur < end:
        nxt = min(cur + max_span, end)
        windows.append((cur, nxt))
        cur = nxt
    return windows or [(start, end)]


def _norm_tokens(name: str) -> set[str]:
    s = re.sub(r"[^\w\s]", " ", (name or "").lower())
    # Drop 1-char initials ("L.", "F.") — odds feeds often abbreviate clubs
    return {t for t in s.split() if len(t) >= 2 and t not in _JUNK_TOKENS}


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
        # Prefix: "man" ↔ "manchester", "apollon" ↔ "apollon…"
        for x in ta:
            if any(
                y.startswith(x) or x.startswith(y)
                for y in tb
                if min(len(x), len(y)) >= 3
            ):
                inter += 1
                break
        if inter == 0:
            # Initial leftover: "Omonia N." vs "Omonia Nicosia" (N already dropped;
            # also "AEK L." vs "AEK Larnaca" when L survived as 1-char in raw)
            raw_a = {t for t in re.sub(r"[^\w\s]", " ", al).split() if t}
            raw_b = {t for t in re.sub(r"[^\w\s]", " ", bl).split() if t}
            shorts = {t for t in raw_a if len(t) == 1}
            if shorts and ta & {t for t in raw_b if len(t) >= 2}:
                if any(any(w.startswith(s) for w in raw_b if len(w) >= 2) for s in shorts):
                    inter = 1
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
    status = normalize_match_status(match.status)
    if status == "FINISHED" and match.home_score is not None and match.away_score is not None:
        return False
    if status in VOIDABLE_MATCH_STATUSES:
        return False
    return True


def _kickoff_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _kickoff_dates(matches: list[Match]) -> set[str]:
    dates: set[str] = set()
    for m in matches:
        ko = _kickoff_utc(m.kickoff_at)
        if ko is None:
            continue
        dates.add(ko.date().isoformat())
        dates.add((ko - timedelta(hours=12)).date().isoformat())
        dates.add((ko + timedelta(hours=12)).date().isoformat())
    return dates


def _date_window(dates: set[str]) -> tuple[datetime, datetime]:
    sorted_days = sorted(dates)
    start = datetime.fromisoformat(sorted_days[0]).replace(tzinfo=timezone.utc) - timedelta(
        hours=12
    )
    end = datetime.fromisoformat(sorted_days[-1]).replace(tzinfo=timezone.utc) + timedelta(
        hours=36
    )
    return start, end


def _finished_candidates(fixtures: list[FixtureMatch]) -> list[FixtureMatch]:
    out: list[FixtureMatch] = []
    for fx in fixtures:
        status = normalize_match_status(fx.status)
        if status == "FINISHED" and fx.home_score is not None and fx.away_score is not None:
            out.append(fx)
        elif status in VOIDABLE_MATCH_STATUSES:
            out.append(fx)
    return out


def _odds_api_io_configured(settings: Settings) -> bool:
    key = (settings.odds_api_io_key or "").strip()
    return bool(key) and key != "your_odds_api_io_key_here"


def _api_football_configured(settings: Settings) -> bool:
    """Score settle may use the key even when fixture sync stays off."""
    key = (settings.api_football_key or "").strip()
    return bool(key) and key != "your_api_football_key_here"


def _fetch_finished_fixtures(
    settings: Settings,
    dates: set[str],
) -> tuple[list[FixtureMatch], str, list[str]]:
    """
    Return (finished fixtures, provider label, notes).

    Merge odds-api.io + API-Football. Never skip API-Football just because
    odds-api.io returned *some* settled rows — those often don't include the
    abbreviated tip match names (Apollon L. vs Apollon Limassol).
    """
    notes: list[str] = []
    merged: list[FixtureMatch] = []
    sources: list[str] = []

    if _odds_api_io_configured(settings):
        try:
            oaio = OddsApiIoProvider(settings)
            oaio_n = 0
            for from_dt, to_dt in _date_windows(dates):
                settled = oaio.fetch_settled_fixtures(from_dt, to_dt)
                merged.extend(settled)
                oaio_n += len(settled)
            if oaio_n:
                sources.append("odds-api-io")
            else:
                notes.append("odds-api.io returned no settled events for that window.")
        except OddsApiIoError as exc:
            notes.append(f"odds-api.io: {exc}")
        except Exception as exc:  # noqa: BLE001
            notes.append(f"odds-api.io: {exc}")

    if _api_football_configured(settings):
        try:
            provider_af = ApiFootballProvider(settings)
            fixtures = provider_af.fetch_for_dates(sorted(dates), all_leagues=True)
            finished = _finished_candidates(fixtures)
            if finished:
                merged.extend(finished)
                sources.append("api-football")
            else:
                notes.append("API-Football returned no finished fixtures for those dates.")
        except ApiFootballError as exc:
            notes.append(f"API-Football: {exc}")
        except Exception as exc:  # noqa: BLE001
            notes.append(f"API-Football: {exc}")
    elif not settings.api_football_enabled:
        notes.append(
            "API-Football key missing — settle uses odds-api.io + DB siblings only."
        )

    provider = "+".join(sources) if sources else "none"
    return merged, provider, notes


def _match_fixture(
    match: Match,
    finished: list[FixtureMatch],
) -> tuple[FixtureMatch | None, bool]:
    best_fx: FixtureMatch | None = None
    best_score = 0.0
    best_swapped = False
    m_ko = _kickoff_utc(match.kickoff_at)
    for fx in finished:
        pair, swapped = _pair_score(match.home_team, match.away_team, fx.home_team, fx.away_team)
        if pair < _PAIR_MIN:
            continue
        fx_ko = _kickoff_utc(fx.kickoff_at)
        if m_ko and fx_ko:
            hours = abs((m_ko - fx_ko).total_seconds()) / 3600.0
            # Tip odds rows sometimes carry a different timezone/day boundary
            # than result feeds — allow up to 48h.
            if hours > 48:
                continue
            pair = pair - min(hours, 12) * 0.008
        if pair > best_score:
            best_score = pair
            best_fx = fx
            best_swapped = swapped
    return best_fx, best_swapped


def _apply_fixture_to_match(match: Match, fx: FixtureMatch, swapped: bool) -> None:
    status = normalize_match_status(fx.status)
    match.status = status
    if status == "FINISHED" and fx.home_score is not None and fx.away_score is not None:
        if swapped:
            match.home_score = fx.away_score
            match.away_score = fx.home_score
        else:
            match.home_score = fx.home_score
            match.away_score = fx.away_score


def _copy_scores_from_db_siblings(
    db: Session,
    need: list[Match],
) -> int:
    """
    Tips often point at odds-api-io rows that stay SCHEDULED while another
    provider row (api-football / football-data) already has FINISHED + scores.
    Copy scores onto the tip's match by team + kickoff proximity.
    """
    if not need:
        return 0
    finished_rows = db.scalars(
        select(Match).where(
            Match.home_score.is_not(None),
            Match.away_score.is_not(None),
        )
    ).all()
    candidates = [
        m
        for m in finished_rows
        if normalize_match_status(m.status) == "FINISHED" or m.home_score is not None
    ]
    if not candidates:
        return 0

    refreshed = 0
    need_ids = {m.id for m in need}
    for match in need:
        best: Match | None = None
        best_score = 0.0
        best_swapped = False
        m_ko = _kickoff_utc(match.kickoff_at)
        for other in candidates:
            if other.id == match.id or other.id in need_ids:
                continue
            pair, swapped = _pair_score(
                match.home_team, match.away_team, other.home_team, other.away_team
            )
            if pair < _PAIR_MIN:
                continue
            o_ko = _kickoff_utc(other.kickoff_at)
            if m_ko and o_ko:
                hours = abs((m_ko - o_ko).total_seconds()) / 3600.0
                if hours > 48:
                    continue
                pair = pair - min(hours, 12) * 0.008
            if pair > best_score:
                best_score = pair
                best = other
                best_swapped = swapped
        if best is None or best.home_score is None or best.away_score is None:
            continue
        match.status = "FINISHED"
        if best_swapped:
            match.home_score = best.away_score
            match.away_score = best.home_score
        else:
            match.home_score = best.home_score
            match.away_score = best.away_score
        refreshed += 1
    return refreshed


def _search_fallback(
    settings: Settings,
    need: list[Match],
    already_refreshed: set[int],
) -> list[FixtureMatch]:
    """Per-match historical search for rows bulk fetch did not match."""
    if not _odds_api_io_configured(settings):
        return []

    unresolved = [m for m in need if m.id not in already_refreshed and m.kickoff_at]
    if not unresolved:
        return []

    try:
        oaio = OddsApiIoProvider(settings)
    except OddsApiIoError:
        return []

    found: list[FixtureMatch] = []
    for match in unresolved[:_MAX_SEARCH_FALLBACK]:
        try:
            fx = oaio.search_settled_fixture(
                match.home_team,
                match.away_team,
                match.kickoff_at,  # type: ignore[arg-type]
            )
        except OddsApiIoError as exc:
            print(f"[odds-api-io] search skip {match.home_team}: {exc}")
            continue
        if fx is not None:
            found.append(fx)
    return found


def refresh_scores_for_matches(
    db: Session,
    settings: Settings,
    matches: list[Match],
    *,
    fetch_external: bool = True,
) -> dict:
    """
    Pull finished / voidable fixtures for pending match kickoff dates and patch
    scores or status onto the given match rows (any provider).

    fetch_external=False skips API calls (uses DB status/scores only).
    """
    need = [m for m in matches if m is not None and _needs_scores(m)]
    if not need:
        return {"refreshed": 0, "fetched": 0, "message": "No matches need scores."}

    # Always try sibling DB rows first (free, no API quota).
    sibling_n = _copy_scores_from_db_siblings(db, need)
    if sibling_n:
        db.flush()
        need = [m for m in need if _needs_scores(m)]

    if not fetch_external:
        return {
            "refreshed": sibling_n,
            "fetched": 0,
            "message": (
                f"Copied scores from {sibling_n} sibling match row(s) (local DB only)."
                if sibling_n
                else "Score refresh skipped (local DB only)."
            ),
            "provider": "local",
            "notes": [],
        }

    if not need:
        return {
            "refreshed": sibling_n,
            "fetched": 0,
            "message": f"Copied scores from {sibling_n} sibling match row(s) in DB.",
            "provider": "db-sibling",
            "notes": [],
        }

    dates = _kickoff_dates(need)
    if not dates:
        return {
            "refreshed": sibling_n,
            "fetched": 0,
            "message": "No kickoff dates to query.",
        }

    finished, provider, notes = _fetch_finished_fixtures(settings, dates)
    finished = _filter_finished_for_need(need, finished)

    refreshed_ids: set[int] = set()
    refreshed = sibling_n
    for match in need:
        best_fx, best_swapped = _match_fixture(match, finished)
        if best_fx is None:
            continue
        _apply_fixture_to_match(match, best_fx, best_swapped)
        refreshed += 1
        refreshed_ids.add(match.id)

    search_found: list[FixtureMatch] = []
    if any(m.id not in refreshed_ids for m in need):
        search_found = _search_fallback(settings, need, refreshed_ids)
        search_found = _filter_finished_for_need(
            [m for m in need if m.id not in refreshed_ids],
            search_found,
        )

    for match in need:
        if match.id in refreshed_ids:
            continue
        best_fx, best_swapped = _match_fixture(match, search_found)
        if best_fx is None:
            continue
        _apply_fixture_to_match(match, best_fx, best_swapped)
        refreshed += 1
        refreshed_ids.add(match.id)

    if refreshed:
        db.flush()

    if refreshed:
        msg = (
            f"Refreshed scores on {refreshed} match(es) "
            f"(siblings={sibling_n}, feed={provider}, "
            f"candidates={len(finished) + len(search_found)})."
        )
    elif notes:
        msg = " ".join(notes) + " Auto-settle may still work for matches already FINISHED in DB."
    else:
        msg = "No finished fixtures found to refresh scores."

    return {
        "refreshed": refreshed,
        "fetched": len(finished) + len(search_found),
        "finished_candidates": len(finished),
        "provider": provider,
        "notes": notes,
        "message": msg,
    }
