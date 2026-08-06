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
    """Create tables if they don't exist (fine for early learning)."""
    # Import models so they register on Base.metadata before create_all
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)