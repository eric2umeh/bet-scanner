#!/usr/bin/env python3
"""
Daily cron job: pull today's football fixtures into Postgres.

Run once manually:
  python scripts/sync_matches.py

Cron example (every day at 07:00 Lagos time on a Linux/Mac host):
  0 7 * * * cd /path/to/bet-scanner && .venv/bin/python scripts/sync_matches.py >> /tmp/bet-scanner-sync.log 2>&1

On Railway/Render later you'll use their "Cron Job" / scheduled worker instead of system cron.
"""

from pathlib import Path
import sys

# Allow `python scripts/sync_matches.py` from project root
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.services.football_data import FootballDataError
from app.services.sync_matches import sync_matches_for_today


def main() -> int:
    init_db()
    settings = get_settings()
    db = SessionLocal()
    try:
        result = sync_matches_for_today(db, settings)
    except FootballDataError as exc:
        print(f"ERROR: {exc}")
        return 1
    finally:
        db.close()

    print(result["message"])
    print(f"Competitions: {', '.join(result['competitions'])}")
    print(f"Upserted: {result['upserted']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())