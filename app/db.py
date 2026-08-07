"""
Database engine + session helpers.

Learning note:
- Engine = connection pool to Postgres
- Session = one "unit of work" (usually one request or one job run)
- Base = parent class for all SQLAlchemy models (tables)
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

engine = create_engine(
    settings.sqlalchemy_database_url,
    # Set DEBUG=true in .env only when you want to see every SQL statement.
    # With Supabase, echo makes syncs look hung and slows learning a lot.
    echo=False,
    pool_pre_ping=True,
)

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
    ]
    try:
        with engine.begin() as conn:
            for sql in statements:
                conn.exec_driver_sql(sql)
    except Exception:
        # Fresh local DBs / missing tips table are fine — create_all handles them.
        pass