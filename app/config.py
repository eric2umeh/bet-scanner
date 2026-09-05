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

    # Phase 12A — optional shared secret for POST/PUT/PATCH/DELETE.
    # Empty = open (local learning). Set on Render so only your phone/dashboard can write.
    # Send as header X-API-Key only (Authorization Bearer is reserved for user login).
    app_api_key: str = ""

    # Phase 12C — Supabase Auth (optional). JWT secret from Project Settings → API.
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""
    # When true and JWT secret is set, tip writes require a signed-in user.
    auth_required_for_tips: bool = False

    database_url: str = (
        "postgresql+psycopg://betscanner:betscanner@localhost:5432/betscanner"
    )

    # --- Fixture provider: football-data.org ---
    football_data_api_key: str = ""
    football_competitions: str = "PL,PD,SA,BL1,FL1"
    sync_days_ahead: int = 21

    # --- Fixture provider: API-Football (api-sports) — optional; off by default ---
    # Free key: https://dashboard.api-football.com/
    api_football_enabled: bool = False
    api_football_key: str = ""
    # Empty = major leagues only; "all" = every fixture that day; or "39,140,135"
    api_football_league_ids: str = ""

    # Which fixture providers to run on POST /matches/sync
    # Recommended: odds-api-io (SportyBet/Bet9ja event list). Optional: football-data
    fixture_providers: str = "odds-api-io"

    # --- Odds sync master switch ---
    # false = never call external odds APIs (saves credits while testing)
    odds_sync_enabled: bool = False
    # Which providers to run when enabled (comma-separated)
    # Recommended free NG path: odds-api-io
    # Optional: the-odds-api (UK/EU credits), betrelay (usually paid)
    odds_providers: str = "odds-api-io"

    # The Odds API (UK/EU) — https://the-odds-api.com/ — ~500 credits/month
    odds_api_key: str = ""
    odds_regions: str = "uk,eu"
    odds_sport_keys: str = (
        "soccer_epl,soccer_spain_la_liga,soccer_italy_serie_a,"
        "soccer_germany_bundesliga,soccer_france_ligue_one"
    )

    # Odds-API.io (FREE) — https://odds-api.io — SportyBet + Bet9ja
    # Docs: https://docs.odds-api.io/quickstart
    odds_api_io_key: str = ""
    odds_api_io_bookmakers: str = "SportyBet,Bet9ja"
    # Free tier ~100 req/hr; /odds/multi batches 10 events per request
    odds_api_io_event_limit: int = 40

    # BetRelay (optional / often paid) — https://betrelay.com.ng/api-docs
    betrelay_api_key: str = ""
    betrelay_match_limit: int = 10

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

    # --- Phase 3C: Bankroll + Safe Builder ---
    # Default unit = this % of bankroll (1% of ₦50k = ₦500)
    bankroll_unit_pct: float = 1.0
    # Underdog odds thresholds (home/away only)
    safe_dog_high: float = 6.0          # underdog >= 6 → Safe DC candidate (no upper cap)
    safe_dog_flex: float = 10.0         # >10 + pick_market=1x2 → flex multi tag
    # Favourite max odds for flex-multi profile (1x2 mode only)
    safe_fav_max_flex: float = 1.50
    # Default market style: double_chance | 1x2 (user can override per scan)
    safe_pick_market: str = "double_chance"
    # Hide historically weak Safe picks from scans when enough history exists
    safe_hide_weak_picks: bool = True
    # Goal-market lean must clear this display score (not a win %). Higher = fewer goal tips.
    goal_lean_min_confidence: float = 60.0
    # Team 3+ (tt_2_5) longshot floor — slightly softer than older 66 default.
    goal_tt_min_confidence: float = 62.0

    # --- Phase 4: Telegram alerts (optional) ---
    telegram_enabled: bool = False
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # --- Phase 5A: Value / EV tips (cross-book de-vig) ---
    # Minimum expected value % vs consensus fair odds
    value_min_ev_pct: float = 1.5
    # Need this many books with full 1X2 on the same match
    value_min_books: int = 2
    # Stake = min(1 unit, bankroll × kelly × this fraction) — 0.25 = quarter Kelly
    value_kelly_fraction: float = 0.25

    # --- Phase 5B: AI explain layer (optional OpenAI-compatible API) ---
    # Engines still pick tips; AI only explains. Works without a key (templates).
    ai_enabled: bool = False
    ai_api_key: str = ""
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"

    # --- Phase 7: Daily ops defaults ---
    ops_default_bankroll_ngn: float = 50000
    ops_brief_max_explains: int = 3

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

    @property
    def odds_providers_list(self) -> list[str]:
        return [p.strip() for p in self.odds_providers.split(",") if p.strip()]

    @property
    def odds_api_io_bookmakers_list(self) -> list[str]:
        return [b.strip() for b in self.odds_api_io_bookmakers.split(",") if b.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cache settings so we don't re-read .env on every request."""
    return Settings()
