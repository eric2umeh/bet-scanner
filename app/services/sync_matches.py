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
from app.services.football_data import FootballDataError
from app.services.match_store import upsert_fixture


def sync_matches_for_today(db: Session, settings: Settings) -> dict:
    """
    Run all enabled fixture providers and upsert into `matches`.

    Default providers:
      - football-data  → upcoming window for big leagues
      - api-football   → today + tomorrow (great for "what's on now")
    """
    enabled = settings.fixture_providers_list
    upserted = 0
    provider_notes: list[str] = []
    errors: list[str] = []

    for name in enabled:
        try:
            fixtures = _fetch_from_provider(name, settings)
        except (FootballDataError, ApiFootballError, ValueError) as exc:
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
    if name == "football-data":
        return FootballDataProvider(settings).fetch_upcoming()
    if name == "api-football":
        return ApiFootballProvider(settings).fetch_today_and_tomorrow()
    raise ValueError(
        f"Unknown fixture provider '{name}'. "
        "Use: football-data, api-football"
    )
