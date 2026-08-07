"""
Tip = a recommendation we logged for hit-rate tracking (Phase 4).

Log every pick you actually care about, then settle won/lost/void.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Tip(Base):
    __tablename__ = "tips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id"), nullable=False, index=True)

    # Safe Builder profile or risk band, e.g. safe_double_chance | accumulator_flex
    risk_profile: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    market: Mapped[str] = mapped_column(String(64), nullable=False)
    selection: Mapped[str] = mapped_column(String(64), nullable=False)

    odds_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    bookmaker: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stake_ngn: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Context for learning from history (Phase 4+)
    pick_market: Mapped[str | None] = mapped_column(String(32), nullable=True)  # double_chance | 1x2
    dog_odds: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    fav_odds: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)

    # safe_builder | manual | arbitrage
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual", index=True)

    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # pending | won | lost | void
    result: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    match: Mapped["Match"] = relationship(back_populates="tips")  # noqa: F821
