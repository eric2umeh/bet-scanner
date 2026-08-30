"""
Phase 12C — optional Supabase user from Authorization: Bearer <access_token>.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException
from jwt import InvalidTokenError

from app.config import Settings, get_settings


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None = None


def assert_resource_owner(
    resource_owner_id: str | None,
    user: AuthUser | None,
    *,
    action: str = "change this",
) -> None:
    """Legacy rows (no owner) stay shared; owned rows need the same account."""
    if not resource_owner_id:
        return
    if user is None:
        raise HTTPException(
            status_code=401,
            detail=f"Sign in to {action}.",
        )
    if resource_owner_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="This belongs to another account.",
        )


def _decode_supabase_user(token: str, settings: Settings) -> AuthUser | None:
    secret = (settings.supabase_jwt_secret or "").strip()
    if not secret or not token:
        return None
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except InvalidTokenError:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    email = payload.get("email")
    return AuthUser(id=str(sub), email=str(email) if email else None)


def get_current_user(
    settings: Settings = Depends(get_settings),
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUser | None:
    """
    Resolve the signed-in user when a Bearer token is present.

    - No SUPABASE_JWT_SECRET → always None (auth off)
    - Bearer present but invalid → 401
    - AUTH_REQUIRED_FOR_TIPS → 401 when no user
    """
    secret = (settings.supabase_jwt_secret or "").strip()
    has_bearer = bool(
        authorization and authorization.strip().lower().startswith("bearer ")
    )

    user: AuthUser | None = None
    if secret and has_bearer:
        token = authorization.strip()[7:].strip()  # type: ignore[union-attr]
        user = _decode_supabase_user(token, settings)
        if user is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired login. Sign in again on Me.",
            )

    if settings.auth_required_for_tips and secret and user is None:
        raise HTTPException(
            status_code=401,
            detail="Sign in required to log or change tips.",
        )
    return user
