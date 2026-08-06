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

    @property
    def competition_codes(self) -> list[str]:
        return [c.strip() for c in self.football_competitions.split(",") if c.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cache settings so we don't re-read .env on every request."""
    return Settings()