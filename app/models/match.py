"""
Match = one football fixture (e.g. Arsenal vs Chelsea).

This is the core table everything else hangs off:
odds belong to a match, tips point at a match.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (
        # Same external fixture should only appear once
        UniqueConstraint("external_id", "provider", name="uq_matches_external_provider"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # ID from football-data.org (or another provider later)
    external_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="football-data")

    competition_code: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    competition_name: Mapped[str] = mapped_column(String(128), nullable=False)

    home_team: Mapped[str] = mapped_column(String(128), nullable=False)
    away_team: Mapped[str] = mapped_column(String(128), nullable=False)

    # Kickoff stored in UTC; convert to local timezone when displaying
    kickoff_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    # SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | POSTPONED | CANCELLED | SUSPENDED
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="SCHEDULED")

    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    odds: Mapped[list["Odd"]] = relationship(back_populates="match")  # noqa: F821
    tips: Mapped[list["Tip"]] = relationship(back_populates="match")  # noqa: F821