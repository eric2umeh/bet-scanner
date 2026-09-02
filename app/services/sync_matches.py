"""
Orchestrate fixture sync from ONE OR MORE providers.

Learning note:
- This file does not call httpx itself.
- It asks each enabled provider for FixtureMatch lists, then saves them.
- Enable/disable providers with FIXTURE_PROVIDERS in .env
"""

from sqlalchemy.orm import Session

from app.config import Settings
from app.providers.api_football import ApiFootballError, ApiFootballProvider
from app.providers.football_data import FootballDataProvider
from app.providers.odds_api_io import OddsApiIoError, OddsApiIoProvider
from app.services.football_data import FootballDataError
from app.services.match_store import upsert_fixture


def sync_matches_for_today(db: Session, settings: Settings) -> dict:
    """
    Run all enabled fixture providers and upsert into `matches`.

    Default provider:
      - odds-api-io  → pending SportyBet/Bet9ja events (same source as odds sync)
    Optional:
      - football-data → big European leagues calendar
      - api-football  → only when API_FOOTBALL_ENABLED=true
    """
    enabled = settings.fixture_providers_list
    upserted = 0
    provider_notes: list[str] = []
    errors: list[str] = []

    for name in enabled:
        if name == "api-football" and not settings.api_football_enabled:
            provider_notes.append(f"{name}=skipped")
            continue
        try:
            fixtures = _fetch_from_provider(name, settings)
        except (FootballDataError, ApiFootballError, OddsApiIoError, ValueError) as exc:
            errors.append(f"{name}: {exc}")
            continue

        count = 0
        for fixture in fixtures:
            upsert_fixture(db, fixture)
            count += 1
        upserted += count
        provider_notes.append(f"{name}={count}")

    db.commit()

    message = f"Upserted {upserted} match row(s) [{', '.join(provider_notes)}]."
    if errors:
        message += " Errors: " + "; ".join(errors)

    return {
        "competitions": settings.competition_codes,
        "providers": enabled,
        "upserted": upserted,
        "message": message,
    }


def _fetch_from_provider(name: str, settings: Settings):
    if name in {"odds-api-io", "odds_api_io"}:
        return OddsApiIoProvider(settings).fetch_pending_fixtures()
    if name == "football-data":
        return FootballDataProvider(settings).fetch_upcoming()
    if name == "api-football":
        if not settings.api_football_enabled:
            raise ValueError(
                "API-Football is disabled (API_FOOTBALL_ENABLED=false). "
                "Remove api-football from FIXTURE_PROVIDERS or re-enable when your account is active."
            )
        return ApiFootballProvider(settings).fetch_today_and_tomorrow()
    raise ValueError(
        f"Unknown fixture provider '{name}'. "
        "Use: odds-api-io, football-data, api-football"
    )
