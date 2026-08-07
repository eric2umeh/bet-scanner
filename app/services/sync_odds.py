"""
Pull odds quotes from ONE OR MORE providers into the `odds` table.

Learning note (Phase 3B):
- the-odds-api  → UK/EU books (credits; keep disabled while testing)
- odds-api-io   → FREE SportyBet + Bet9ja (recommended now)
- betrelay      → optional paid/test NG odds compare

Same `odds` table + same /arbitrage/scan — no math rewrite.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Odd
from app.providers.base import FixtureMatch, OddQuote
from app.providers.betrelay import BetRelayError, BetRelayProvider
from app.providers.odds_api_io import OddsApiIoError, OddsApiIoProvider
from app.providers.the_odds_api import TheOddsApiError, TheOddsApiProvider
from app.services.match_store import upsert_fixture

ODDS_BATCH_SIZE = 200


def sync_odds(db: Session, settings: Settings) -> dict:
    """Fetch odds from every enabled provider in ODDS_PROVIDERS."""
    if not settings.odds_sync_enabled:
        return {
            "inserted": 0,
            "matches_touched": 0,
            "message": (
                "Odds sync is DISABLED (ODDS_SYNC_ENABLED=false). "
                "No external credits/requests used. "
                "Set ODDS_SYNC_ENABLED=true when you want a fresh pull."
            ),
            "ok": False,
        }

    providers = settings.odds_providers_list
    if not providers:
        return {
            "inserted": 0,
            "matches_touched": 0,
            "message": "ODDS_PROVIDERS is empty. Example: odds-api-io",
            "ok": False,
        }

    all_quotes: list[OddQuote] = []
    notes: list[str] = []
    errors: list[str] = []

    for name in providers:
        try:
            quotes = _fetch_provider(name, settings, db)
            all_quotes.extend(quotes)
            notes.append(f"{name}={len(quotes)}")
        except (TheOddsApiError, OddsApiIoError, BetRelayError, ValueError) as exc:
            errors.append(f"{name}: {exc}")

    if not all_quotes and errors:
        return {
            "inserted": 0,
            "matches_touched": 0,
            "message": "Odds sync failed: " + "; ".join(errors),
            "ok": False,
        }

    print(f"[odds-sync] total quotes={len(all_quotes)} [{', '.join(notes)}]")

    match_cache: dict[tuple[str, str], int] = {}
    for quote in all_quotes:
        if quote.existing_match_id is not None:
            match_cache[(quote.provider, quote.external_match_id)] = quote.existing_match_id
            continue
        key = (quote.provider, quote.external_match_id)
        if key in match_cache:
            continue
        match = _ensure_match(db, quote)
        db.commit()
        match_cache[key] = match.id

    print(f"[odds-sync] ensured {len(match_cache)} match link(s)")

    inserted = 0
    captured_at = datetime.now(timezone.utc)
    batch: list[Odd] = []
    match_ids: set[int] = set()

    for quote in all_quotes:
        match_id = match_cache[(quote.provider, quote.external_match_id)]
        match_ids.add(match_id)
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
            print(f"[odds-sync] committed {inserted}/{len(all_quotes)} odds")
            batch = []

    if batch:
        db.add_all(batch)
        db.commit()
        inserted += len(batch)

    message = (
        f"Inserted {inserted} odd snapshot(s) across {len(match_ids)} match(es) "
        f"[{', '.join(notes)}]."
    )
    if errors:
        message += " Partial errors: " + "; ".join(errors)

    return {
        "inserted": inserted,
        "matches_touched": len(match_ids),
        "message": message,
        "ok": True,
    }


def _fetch_provider(name: str, settings: Settings, db: Session) -> list[OddQuote]:
    if name in {"the-odds-api", "the_odds_api"}:
        return TheOddsApiProvider(settings).fetch_h2h_odds()
    if name in {"odds-api-io", "odds_api_io"}:
        return OddsApiIoProvider(settings).fetch_h2h_odds()
    if name == "betrelay":
        return BetRelayProvider(settings).fetch_h2h_odds(db)
    raise ValueError(
        f"Unknown odds provider '{name}'. "
        "Use: odds-api-io, the-odds-api, betrelay"
    )


def _ensure_match(db: Session, quote: OddQuote):
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
