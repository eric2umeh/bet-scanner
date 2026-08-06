"""
Pull odds quotes and store snapshots in the `odds` table.

Learning note:
- Odds change over time → we INSERT new rows (snapshots), we don't overwrite history.
- Each Odd row points at a Match via match_id.
- If The Odds API event is new, we also create a Match row (provider=the-odds-api).

Performance note (Supabase):
- Remote DB + many bookmaker quotes = slow if we query once per quote.
- We cache matches in memory and commit in small batches to avoid statement timeouts.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Odd
from app.providers.base import FixtureMatch, OddQuote
from app.providers.the_odds_api import TheOddsApiError, TheOddsApiProvider
from app.services.match_store import upsert_fixture

# Keep batches small for Supabase free-tier statement timeouts
ODDS_BATCH_SIZE = 200


def sync_odds(db: Session, settings: Settings) -> dict:
    """Fetch h2h odds and write Odd snapshots."""
    try:
        provider = TheOddsApiProvider(settings)
        quotes = provider.fetch_h2h_odds()
    except TheOddsApiError as exc:
        return {
            "inserted": 0,
            "matches_touched": 0,
            "message": f"Odds sync failed: {exc}",
            "ok": False,
        }

    print(f"[odds-sync] fetched {len(quotes)} quote(s)")

    # --- Pass 1: ensure one Match per event (commit after each new match) ---
    match_cache: dict[tuple[str, str], int] = {}
    for quote in quotes:
        key = (quote.provider, quote.external_match_id)
        if key in match_cache:
            continue
        match = _ensure_match(db, quote)
        db.commit()  # release locks quickly on remote Postgres
        match_cache[key] = match.id

    print(f"[odds-sync] ensured {len(match_cache)} match(es)")

    # --- Pass 2: insert odd snapshots in batches ---
    inserted = 0
    captured_at = datetime.now(timezone.utc)
    batch: list[Odd] = []

    for quote in quotes:
        match_id = match_cache[(quote.provider, quote.external_match_id)]
        batch.append(
            Odd(
                match_id=match_id,
                bookmaker=quote.bookmaker,
                market=quote.market,
                selection=quote.selection,
                price=quote.price,
                captured_at=quote.captured_at or captured_at,
            )
        )
        if len(batch) >= ODDS_BATCH_SIZE:
            db.add_all(batch)
            db.commit()
            inserted += len(batch)
            print(f"[odds-sync] committed {inserted}/{len(quotes)} odds")
            batch = []

    if batch:
        db.add_all(batch)
        db.commit()
        inserted += len(batch)

    return {
        "inserted": inserted,
        "matches_touched": len(match_cache),
        "message": (
            f"Inserted {inserted} odd snapshot(s) across {len(match_cache)} match(es). "
            "Free tier: watch x-requests-remaining in server logs."
        ),
        "ok": True,
    }


def _ensure_match(db: Session, quote: OddQuote):
    """Create/update a Match so every Odd has a parent row."""
    fixture = FixtureMatch(
        external_id=quote.external_match_id,
        provider=quote.provider,
        competition_code=quote.competition_code,
        competition_name=quote.competition_name,
        home_team=quote.home_team,
        away_team=quote.away_team,
        kickoff_at=quote.kickoff_at,
        status="SCHEDULED",
    )
    return upsert_fixture(db, fixture)
