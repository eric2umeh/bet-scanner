#!/usr/bin/env python3
"""
Phase 8 — check that required env vars exist (does NOT print secret values).

  python scripts/check_deploy_env.py
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings


def _present(value: str) -> bool:
    v = (value or "").strip()
    if not v:
        return False
    placeholders = (
        "your_token_here",
        "your_odds_api_io_key_here",
        "your_ai_api_key_here",
        "YOUR_PASSWORD",
        "sk-...",
        "postgres.xxxxx",
    )
    return not any(p in v for p in placeholders)


def main() -> int:
    get_settings.cache_clear()
    s = get_settings()

    required = {
        "DATABASE_URL": s.database_url,
        "FOOTBALL_DATA_API_KEY": s.football_data_api_key,
    }
    recommended = {
        "API_FOOTBALL_KEY": s.api_football_key,
        "ODDS_API_IO_KEY": s.odds_api_io_key,
    }
    optional = {
        "TELEGRAM": bool(s.telegram_enabled and s.telegram_bot_token and s.telegram_chat_id),
        "AI": bool(s.ai_enabled and s.ai_api_key),
        "ODDS_SYNC_ENABLED": s.odds_sync_enabled,
    }

    ok = True
    print(f"APP_ENV={s.app_env} DEBUG={s.debug}")
    for name, value in required.items():
        good = _present(value)
        ok = ok and good
        print(f"[{'OK' if good else 'MISSING'}] required {name}")
    for name, value in recommended.items():
        print(f"[{'OK' if _present(value) else 'EMPTY'}] recommended {name}")
    for name, value in optional.items():
        print(f"[{'ON' if value else 'off'}] optional {name}")

    if not ok:
        print("Fix MISSING required vars before deploying to Render.")
        return 1
    print("Required env looks set. Safe to configure the same keys on Render.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
