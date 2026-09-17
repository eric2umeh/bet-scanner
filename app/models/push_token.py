"""Expo push tokens for morning digest + tip-settled alerts."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PushToken(Base):
    __tablename__ = "push_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Supabase Auth user id (JWT sub)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # Expo push token (ExponentPushToken[…])
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    notify_morning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_settled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
