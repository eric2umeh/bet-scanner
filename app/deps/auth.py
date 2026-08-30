"""
Phase 12C — optional Supabase user from Authorization: Bearer <access_token>.

Supabase now signs user JWTs with ES256 (JWKS). Legacy HS256 + JWT secret still
supported for older projects.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException
from jwt import InvalidTokenError, PyJWKClient
from jwt.exceptions import MissingCryptographyError

from app.config import Settings, get_settings


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None = None


def auth_verification_enabled(settings: Settings) -> bool:
    """True when the server can verify Supabase user tokens."""
    return bool((settings.supabase_url or "").strip()) or bool(
        (settings.supabase_jwt_secret or "").strip()
    )


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


@lru_cache(maxsize=4)
def _jwks_client(supabase_url: str) -> PyJWKClient:
    base = supabase_url.rstrip("/")
    return PyJWKClient(f"{base}/auth/v1/.well-known/jwks.json", cache_keys=True)


def _user_from_payload(payload: dict) -> AuthUser | None:
    sub = payload.get("sub")
    if not sub:
        return None
    email = payload.get("email")
    return AuthUser(id=str(sub), email=str(email) if email else None)


def _decode_supabase_user(token: str, settings: Settings) -> AuthUser | None:
    if not token:
        return None

    supabase_url = (settings.supabase_url or "").strip()
    if supabase_url:
        try:
            signing_key = _jwks_client(supabase_url).get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
            )
            user = _user_from_payload(payload)
            if user:
                return user
        except (InvalidTokenError, MissingCryptographyError):
            pass

    secret = (settings.supabase_jwt_secret or "").strip()
    if secret:
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
            return _user_from_payload(payload)
        except InvalidTokenError:
            return None

    return None


def get_current_user(
    settings: Settings = Depends(get_settings),
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUser | None:
    """
    Resolve the signed-in user when a Bearer token is present.

    - Auth off (no SUPABASE_URL and no JWT secret) → always None
    - Bearer present but invalid → 401
    - AUTH_REQUIRED_FOR_TIPS → 401 when no user
    """
    auth_on = auth_verification_enabled(settings)
    has_bearer = bool(
        authorization and authorization.strip().lower().startswith("bearer ")
    )

    user: AuthUser | None = None
    if auth_on and has_bearer:
        token = authorization.strip()[7:].strip()  # type: ignore[union-attr]
        user = _decode_supabase_user(token, settings)
        if user is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired login. Sign in again on Me.",
            )

    if settings.auth_required_for_tips and auth_on and user is None:
        raise HTTPException(
            status_code=401,
            detail="Sign in required to log or change tips.",
        )
    return user
