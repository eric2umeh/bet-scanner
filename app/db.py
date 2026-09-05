"""
Database engine + session helpers.

Learning note:
- Engine = connection pool to Postgres
- Session = one "unit of work" (usually one request or one job run)
- Base = parent class for all SQLAlchemy models (tables)

Supabase pooler note:
- Session mode (:5432) allows ~15 clients TOTAL across laptop + Render.
  SQLAlchemy's default pool (5 + 10 overflow) alone can exhaust it →
  "max clients reached" and the app looks "down" even when the DB is healthy.
- Prefer Transaction mode (:6543) + NullPool when possible.
"""

from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
_db_url = settings.sqlalchemy_database_url
_use_null_pool = ":6543" in _db_url  # Supabase transaction pooler

_engine_kwargs: dict = {
    "echo": False,
    "pool_pre_ping": True,
}
if _use_null_pool:
    _engine_kwargs["poolclass"] = NullPool
else:
    # Session pooler / direct Postgres — keep a tiny pool so local + Render fit.
    _engine_kwargs.update(
        pool_size=2,
        max_overflow=0,
        pool_recycle=280,
        pool_timeout=30,
    )

engine = create_engine(_db_url, **_engine_kwargs)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency: open a DB session per request, then close it.

    Usage in a route:
        def list_matches(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ping_db() -> bool:
    """True if a trivial query succeeds (releases the connection immediately)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


def dispose_engine() -> None:
    """Drop pooled connections (call on shutdown / reload)."""
    engine.dispose()


def init_db() -> None:
    """
    Create tables if they don't exist (fine for early learning).

    Does not crash the API if Supabase/DNS is temporarily down —
    endpoints that need the DB will still fail until connectivity returns.
    """
    # Import models so they register on Base.metadata before create_all
    from app import models  # noqa: F401

    try:
        Base.metadata.create_all(bind=engine)
        _ensure_tip_columns()
    except Exception as exc:  # noqa: BLE001 — startup must stay up for /health
        print(
            "WARNING: init_db could not reach the database.\n"
            f"  {type(exc).__name__}: {exc}\n"
            "  Check internet/DNS and DATABASE_URL (Supabase host).\n"
            "  If you see 'max clients reached', close extra apps using the DB\n"
            "  or switch DATABASE_URL to the Transaction pooler (port 6543).\n"
            "  Server will start, but match/odds/tips calls will fail until DB is reachable."
        )


def _ensure_tip_columns() -> None:
    """
    create_all does not ALTER existing tables.
    Add Phase 4 tip columns when upgrading an older DB.
    """
    statements = [
        "ALTER TABLE tips ADD COLUMN IF NOT EXISTS bookmaker VARCHAR(64)",
        "ALTER TABLE tips ADD COLUMN IF NOT EXISTS stake_ngn NUMERIC(12, 2)",
        "ALTER TABLE tips ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'manual'",
        "ALTER TABLE tips ADD COLUMN IF NOT EXISTS pick_market VARCHAR(32)",
        "ALTER TABLE tips ADD COLUMN IF NOT EXISTS dog_odds NUMERIC(10, 3)",
        "ALTER TABLE tips ADD COLUMN IF NOT EXISTS fav_odds NUMERIC(10, 3)",
        "ALTER TABLE tips ADD COLUMN IF NOT EXISTS slip_id VARCHAR(36)",
        "ALTER TABLE tips ADD COLUMN IF NOT EXISTS owner_id VARCHAR(36)",
        "ALTER TABLE tips ADD COLUMN IF NOT EXISTS confidence_pct NUMERIC(5, 1)",
        "ALTER TABLE tipsters ADD COLUMN IF NOT EXISTS owner_id VARCHAR(36)",
    ]
    try:
        with engine.begin() as conn:
            for sql in statements:
                conn.exec_driver_sql(sql)
    except Exception:
        # Fresh local DBs / missing tips table are fine — create_all handles them.
        pass
