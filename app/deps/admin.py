"""DB-backed admin role helpers."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps.auth import AuthUser, get_current_user
from app.services import user_profiles as profiles


def is_admin_user(db: Session, user: AuthUser | None) -> bool:
    if user is None:
        return False
    return profiles.is_admin_id(db, user.id)


def require_admin(
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> AuthUser:
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required.")
    if not is_admin_user(db, user):
        raise HTTPException(status_code=403, detail="Admin only.")
    return user


def assert_can_load_matches(
    db: Session,
    settings: Settings,
    user: AuthUser | None,
    *,
    x_api_key: str | None = None,
) -> None:
    """
    Load matches / odds sync:
      - signed-in admin → allowed
      - signed-in non-admin → denied (even if X-API-Key is present)
      - no user + matching X-API-Key → allowed when ADMIN_SYNC_WITH_API_KEY (cron)
    """
    if is_admin_user(db, user):
        return
    if user is not None:
        raise HTTPException(
            status_code=403,
            detail="Only an admin account can Load matches. Tips refresh automatically from the host’s last sync.",
        )
    key = (settings.app_api_key or "").strip()
    provided = (x_api_key or "").strip()
    if (
        settings.admin_sync_with_api_key
        and key
        and provided
        and provided == key
    ):
        return
    raise HTTPException(
        status_code=403,
        detail="Only an admin account can Load matches. Sign in as admin, or ask the host to refresh odds.",
    )


def require_can_load_matches(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user: AuthUser | None = Depends(get_current_user),
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> AuthUser | None:
    assert_can_load_matches(db, settings, user, x_api_key=x_api_key)
    return user
