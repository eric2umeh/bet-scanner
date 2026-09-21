#!/usr/bin/env python3
"""
One-shot / cron: shrink the odds table (Supabase Shared Pooler egress).

  python scripts/prune_odds.py

Keeps latest snapshot per (match, book, market, selection) and drops odds
for matches whose kickoff is older than ODDS_KEEP_PAST_KICKOFF_HOURS (default 48).
"""

from pathlib import Path
import sys

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.services.odds_prune import prune_odds


def main() -> int:
    init_db()
    settings = get_settings()
    db = SessionLocal()
    try:
        before = db.execute(text("SELECT COUNT(*) FROM odds")).scalar()
        result = prune_odds(db, settings)
        after = db.execute(text("SELECT COUNT(*) FROM odds")).scalar()
    finally:
        db.close()

    print(result["message"])
    print(f"odds_rows: {before} → {after} (−{result['deleted_total']})")
    return 0 if result.get("ok", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
