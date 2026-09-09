"""Upsert + role helpers for user_profiles."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.deps.auth import AuthUser
from app.models.user_profile import UserProfile


def admin_count(db: Session) -> int:
    return int(
        db.scalar(select(func.count()).select_from(UserProfile).where(UserProfile.is_admin.is_(True)))
        or 0
    )


def get_profile(db: Session, user_id: str) -> UserProfile | None:
    return db.get(UserProfile, user_id)


def is_admin_id(db: Session, user_id: str | None) -> bool:
    if not user_id:
        return False
    row = get_profile(db, user_id)
    return bool(row and row.is_admin)


def upsert_profile_for_user(
    db: Session,
    user: AuthUser,
    settings: Settings,
) -> UserProfile:
    """
    Ensure a profile row exists. When the DB has zero admins and the user's
    email is listed in BOOTSTRAP_ADMIN_EMAIL (comma-separated), promote them once.
    """
    email = (user.email or "").strip().lower()
    now = datetime.now(timezone.utc)
    row = get_profile(db, user.id)
    if row is None:
        row = UserProfile(id=user.id, email=email or user.id, is_admin=False)
        db.add(row)
    elif email and row.email != email:
        row.email = email

    bootstrap = {
        e.strip().lower()
        for e in (settings.bootstrap_admin_email or "").split(",")
        if e.strip()
    }
    if email and email in bootstrap and admin_count(db) == 0:
        row.is_admin = True

    row.updated_at = now
    db.commit()
    db.refresh(row)
    return row


def list_profiles(
    db: Session,
    *,
    q: str | None = None,
    limit: int = 30,
) -> list[UserProfile]:
    limit = max(1, min(limit, 100))
    stmt = select(UserProfile)
    needle = (q or "").strip()
    if needle:
        stmt = stmt.where(UserProfile.email.ilike(f"%{needle}%"))
    stmt = stmt.order_by(UserProfile.email.asc()).limit(limit)
    return list(db.scalars(stmt).all())


def set_admin(
    db: Session,
    *,
    user_id: str,
    is_admin: bool,
) -> UserProfile:
    row = get_profile(db, user_id)
    if row is None:
        raise LookupError("User not found. They must sign in at least once first.")
    if row.is_admin and not is_admin and admin_count(db) <= 1:
        raise PermissionError("Cannot remove the last admin.")
    row.is_admin = is_admin
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


def profile_to_dict(row: UserProfile) -> dict:
    return {
        "id": row.id,
        "email": row.email,
        "is_admin": bool(row.is_admin),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
