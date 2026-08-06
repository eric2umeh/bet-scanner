#!/usr/bin/env python3
"""
Cron-friendly odds sync.

  python scripts/sync_odds.py

Free tier tip: run this a few times a day max, not every minute.
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.services.sync_odds import sync_odds


def main() -> int:
    init_db()
    settings = get_settings()
    db = SessionLocal()
    try:
        result = sync_odds(db, settings)
    finally:
        db.close()

    print(result["message"])
    print(f"inserted={result['inserted']} matches_touched={result['matches_touched']}")
    return 0 if result.get("ok", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
