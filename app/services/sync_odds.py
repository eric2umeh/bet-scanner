"""
Pull odds quotes and store snapshots in the `odds` table.

Learning note:
- Odds change over time → we INSERT new rows (snapshots), we don't overwrite history.
- Each Odd row points at a Match via match_id.
- If The Odds API event is new, we also create a Match row (provider=the-odds-api).
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Odd
from app.providers.base import FixtureMatch, OddQuote
from app.providers.the_odds_api import TheOddsApiError, TheOddsApiProvider
from app.services.match_store import upsert_fixture


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

    inserted = 0
    match_ids: set[int] = set()
    captured_at = datetime.now(timezone.utc)

    for quote in quotes:
        match = _ensure_match(db, quote)
        match_ids.add(match.id)

        db.add(
            Odd(
                match_id=match.id,
                bookmaker=quote.bookmaker,
                market=quote.market,
                selection=quote.selection,
                price=quote.price,
                captured_at=quote.captured_at or captured_at,
            )
        )
        inserted += 1

    db.commit()

    return {
        "inserted": inserted,
        "matches_touched": len(match_ids),
        "message": (
            f"Inserted {inserted} odd snapshot(s) across {len(match_ids)} match(es). "
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
