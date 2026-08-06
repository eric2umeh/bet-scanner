"""
App settings loaded from environment variables (.env).

Learning note:
- Keep secrets (API keys, DB passwords) OUT of code.
- pydantic-settings reads .env automatically when you create Settings().
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

    football_data_api_key: str = ""
    football_competitions: str = "PL,PD,SA,BL1,FL1"
    app_timezone: str = "Africa/Lagos"
    # How many days ahead to pull fixtures (today is often empty midweek / pre-season)
    sync_days_ahead: int = 21

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


@lru_cache
def get_settings() -> Settings:
    """Cache settings so we don't re-read .env on every request."""
    return Settings()