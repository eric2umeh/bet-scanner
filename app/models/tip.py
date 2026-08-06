"""
Tip = a recommendation we (or later, a tipster) made on a match.

Logging every tip is non-negotiable — this becomes your performance history.
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

    # safe | balanced | high
    risk_profile: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    market: Mapped[str] = mapped_column(String(64), nullable=False)
    selection: Mapped[str] = mapped_column(String(64), nullable=False)

    # Odds we recommended at (optional until odds sync exists)
    odds_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)

    # Short human reason (LLM can expand this later)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    # pending | won | lost | void
    result: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    match: Mapped["Match"] = relationship(back_populates="tips")  # noqa: F821