"""
Phase 15A/B — scouted booking codes (public feed).

Codes are opaque bookmaker strings (SportyBet / Bet9ja). 15B adds confidence
only when legs or rich meta (folds + odds) exist; otherwise Unverified.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ScoutedCode(Base):
    __tablename__ = "scouted_codes"
    __table_args__ = (
        UniqueConstraint("bookmaker", "code_text", name="uq_scouted_book_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code_text: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    bookmaker: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # hub | web | twitter | manual | tipster
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="web", index=True)
    source_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    folds: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    combined_odds: Mapped[Decimal | None] = mapped_column(Numeric(14, 3), nullable=True, index=True)
    # safer | stretch | lottery | unknown — heuristic for 15A, not a win guarantee
    risk_band: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown", index=True)
    title: Mapped[str | None] = mapped_column(String(240), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Phase 15B — confidence
    # JSON list of {raw, home_hint, away_hint, market, selection}
    legs_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # unverified | legs | rich_meta
    verification: Mapped[str] = mapped_column(
        String(16), nullable=False, default="unverified", index=True
    )
    confidence_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 1), nullable=True)
    confidence_label: Mapped[str | None] = mapped_column(String(120), nullable=True)

    scouted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
