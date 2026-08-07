#!/usr/bin/env python3
"""
Phase 7 — cron-friendly daily ops (morning run).

  python scripts/daily_ops.py
  python scripts/daily_ops.py --no-odds          # save free odds quota
  python scripts/daily_ops.py --telegram         # send digest if configured

Cron example (07:30 Africa/Lagos on a Mac/Linux host):
  30 7 * * * cd /path/to/bet-scanner && .venv/bin/python scripts/daily_ops.py --telegram >> /tmp/bet-scanner-ops.log 2>&1

On Railway/Render later: use a Scheduled Job that runs this script.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.services.daily_ops import run_daily_ops


def main() -> int:
    parser = argparse.ArgumentParser(description="Bet Scanner daily ops")
    parser.add_argument("--no-fixtures", action="store_true")
    parser.add_argument("--no-odds", action="store_true", help="Skip odds sync (save quota)")
    parser.add_argument("--no-settle", action="store_true")
    parser.add_argument("--no-brief", action="store_true")
    parser.add_argument("--telegram", action="store_true", help="Send Telegram digest")
    parser.add_argument("--no-llm", action="store_true", help="Force template explains")
    args = parser.parse_args()

    init_db()
    settings = get_settings()
    db = SessionLocal()
    try:
        result = run_daily_ops(
            db,
            settings,
            sync_fixtures=not args.no_fixtures,
            sync_odds_flag=not args.no_odds,
            auto_settle=not args.no_settle,
            build_brief=not args.no_brief,
            notify_telegram=args.telegram,
            prefer_llm=not args.no_llm,
        )
    finally:
        db.close()

    print(result["summary"])
    for step in result.get("steps") or []:
        mark = "OK" if step.get("ok") else "FAIL"
        print(f"  [{mark}] {step.get('step')}: {step.get('message')}")
    if result.get("errors"):
        print("errors:")
        for e in result["errors"]:
            print(f"  - {e}")
    if result.get("telegram"):
        print("telegram:", result["telegram"].get("message"))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
