"""
App settings loaded from environment variables (.env).

Learning note:
- Keep secrets (API keys, DB passwords) OUT of code.
- pydantic-settings reads .env automatically when you create Settings().
- Free APIs we use:
    1) football-data.org     → fixtures (big leagues)
    2) API-Football          → fixtures today/tomorrow
    3) The Odds API          → bookmaker odds snapshots
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "bet-scanner"
    app_env: str = "development"
    debug: bool = True

    database_url: str = (
        "postgresql+psycopg://betscanner:betscanner@localhost:5432/betscanner"
    )

    # --- Fixture provider: football-data.org ---
    football_data_api_key: str = ""
    football_competitions: str = "PL,PD,SA,BL1,FL1"
    sync_days_ahead: int = 21

    # --- Fixture provider: API-Football (api-sports) ---
    # Free key: https://dashboard.api-football.com/
    api_football_key: str = ""
    # Empty = major leagues only; "all" = every fixture that day; or "39,140,135"
    api_football_league_ids: str = ""

    # Which fixture providers to run on POST /matches/sync
    # Examples: "football-data,api-football" or just "api-football"
    fixture_providers: str = "football-data,api-football"

    # --- Odds provider: The Odds API ---
    # Free key: https://the-odds-api.com/
    odds_api_key: str = ""
    odds_regions: str = "uk,eu"
    odds_sport_keys: str = (
        "soccer_epl,soccer_spain_la_liga,soccer_italy_serie_a,"
        "soccer_germany_bundesliga,soccer_france_ligue_one"
    )

    app_timezone: str = "Africa/Lagos"

    # --- Phase 3A: Arbitrage / surebets ---
    # Minimum theoretical profit % to show in /arbitrage/scan
    arb_min_profit_pct: float = 0.3
    # Ignore odds older than this (minutes) — stale prices are dangerous
    arb_max_odds_age_minutes: int = 180
    # Filter palpable errors / typos
    arb_min_odds: float = 1.01
    arb_max_odds: float = 15.0
    # Round stakes to nearest ₦100 so they look recreational
    arb_stake_round_to: int = 100

    @property
    def sqlalchemy_database_url(self) -> str:
        """
        Supabase/Neon paste URLs as postgresql://...
        SQLAlchemy needs postgresql+psycopg://... for the psycopg v3 driver.
        """
        url = self.database_url.strip().strip('"').strip("'")
        if url.startswith("postgres://"):
            return "postgresql+psycopg://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url[len("postgresql://") :]
        return url

    @property
    def competition_codes(self) -> list[str]:
        return [c.strip() for c in self.football_competitions.split(",") if c.strip()]

    @property
    def fixture_providers_list(self) -> list[str]:
        return [p.strip() for p in self.fixture_providers.split(",") if p.strip()]

    @property
    def odds_sport_keys_list(self) -> list[str]:
        return [s.strip() for s in self.odds_sport_keys.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cache settings so we don't re-read .env on every request."""
    return Settings()
