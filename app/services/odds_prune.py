"""
Trim the append-only `odds` table so scans don't re-ship hundreds of MB
through the Supabase pooler (Shared Pooler egress).

Strategy:
  1) Keep only the newest row per (match_id, bookmaker, market, selection).
  2) Drop odds for matches whose kickoff is older than keep_past_kickoff_hours
     (default 48h) — past fixtures are useless for new bets.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings

# Batch deletes so a half-million-row table does not lock forever.
_DELETE_BATCH = 25_000


def prune_odds(db: Session, settings: Settings) -> dict:
    """
    Run both prune steps. Safe to call after every odds sync.
    Returns counts of deleted rows.
    """
    keep_hours = max(1, int(getattr(settings, "odds_keep_past_kickoff_hours", 48) or 48))
    dupes = _delete_non_latest(db)
    stale = _delete_past_match_odds(db, keep_hours=keep_hours)
    total = dupes + stale
    if total:
        print(f"[odds-prune] removed {dupes} duplicate snapshot(s), {stale} past-match row(s)")
    return {
        "deleted_duplicates": dupes,
        "deleted_past_match": stale,
        "deleted_total": total,
        "keep_past_kickoff_hours": keep_hours,
        "ok": True,
        "message": (
            f"Pruned odds: −{dupes} duplicate snapshots, −{stale} past-match rows "
            f"(keep kickoffs within last {keep_hours}h)."
            if total
            else "Odds table already lean — nothing to prune."
        ),
    }


def _delete_non_latest(db: Session) -> int:
    """Delete every odds row that is not the newest for its key."""
    deleted = 0
    while True:
        result = db.execute(
            text(
                f"""
                WITH ranked AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY match_id, bookmaker, market, selection
                               ORDER BY captured_at DESC, id DESC
                           ) AS rn
                    FROM odds
                ),
                doomed AS (
                    SELECT id FROM ranked WHERE rn > 1 LIMIT {_DELETE_BATCH}
                )
                DELETE FROM odds o
                USING doomed d
                WHERE o.id = d.id
                """
            )
        )
        n = result.rowcount or 0
        db.commit()
        deleted += n
        if n < _DELETE_BATCH:
            break
    return deleted


def _delete_past_match_odds(db: Session, *, keep_hours: int) -> int:
    """Delete odds for matches that kicked off more than keep_hours ago."""
    deleted = 0
    while True:
        result = db.execute(
            text(
                f"""
                WITH doomed AS (
                    SELECT o.id
                    FROM odds o
                    JOIN matches m ON m.id = o.match_id
                    WHERE m.kickoff_at < (NOW() AT TIME ZONE 'utc')
                          - make_interval(hours => :hours)
                    LIMIT {_DELETE_BATCH}
                )
                DELETE FROM odds o
                USING doomed d
                WHERE o.id = d.id
                """
            ),
            {"hours": keep_hours},
        )
        n = result.rowcount or 0
        db.commit()
        deleted += n
        if n < _DELETE_BATCH:
            break
    return deleted
