"""
Odd = a price snapshot for one market on one match.

Learning note:
- We INSERT new rows when odds change (history), we don't overwrite.
- Phase 2 source: The Odds API (free) → UK/EU books.
- Later sources can be SportyBet / Bet9ja adapters writing the SAME table.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Odd(Base):
    __tablename__ = "odds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id"), nullable=False, index=True)

    bookmaker: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. sportybet
    market: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. 1X2, double_chance
    selection: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. home, draw, 1X
    price: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)

    # When we observed this price (odds move — snapshots matter)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    match: Mapped["Match"] = relationship(back_populates="odds")  # noqa: F821