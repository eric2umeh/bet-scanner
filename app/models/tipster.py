"""
Tipster + booking codes (Phase 6).

NG “codes” from Instagram/Telegram are usually opaque booking strings
(SportyBet / Bet9ja). We store them, settle honestly, and rank tipsters
by verified hit-rate / ROI — not by hype.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Tipster(Base):
    __tablename__ = "tipsters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    handle: Mapped[str | None] = mapped_column(String(128), nullable=True)
    platform: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )  # instagram | telegram | twitter | other
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    codes: Mapped[list["BookingCode"]] = relationship(back_populates="tipster")


class BookingCode(Base):
    __tablename__ = "booking_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipster_id: Mapped[int] = mapped_column(
        ForeignKey("tipsters.id"), nullable=False, index=True
    )

    # Opaque booking code from the book (or free-text slip)
    code_text: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    bookmaker: Mapped[str] = mapped_column(String(64), nullable=False, default="sportybet")

    # Optional structured summary (human-parsed markets)
    markets_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    stake_ngn: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    # Total/combo odds if known (helps ROI)
    odds_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 3), nullable=True)

    source: Mapped[str] = mapped_column(
        String(32), nullable=False, default="manual"
    )  # manual | instagram | telegram
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # pending | won | lost | void
    result: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    settled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    tipster: Mapped["Tipster"] = relationship(back_populates="codes")
