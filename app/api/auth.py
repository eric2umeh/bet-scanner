"""
Phase 12C — auth status helpers (login itself is done by Supabase client).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps.admin import is_admin_user
from app.deps.auth import AuthUser, auth_verification_enabled, get_optional_user
from app.services import user_profiles as profiles
from app.services.bookmakers import configured_odds_books

router = APIRouter(prefix="/auth", tags=["auth"])


class ProfileUpdateBody(BaseModel):
    first_name: str | None = Field(None, max_length=80)
    last_name: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=32)
    address_line: str | None = Field(None, max_length=240)
    city: str | None = Field(None, max_length=80)
    state: str | None = Field(None, max_length=80)
    country: str | None = Field(None, max_length=80)


def _require_user(user: AuthUser | None) -> AuthUser:
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return user


@router.get("/config")
def auth_config(settings: Settings = Depends(get_settings)) -> dict:
    """Public Supabase keys for web / Expo clients (anon key is safe to expose)."""
    url = (settings.supabase_url or "").strip()
    anon = (settings.supabase_anon_key or "").strip()
    return {
        "supabase_url": url or None,
        "supabase_anon_key": anon or None,
        "auth_configured": bool(url and anon),
        "odds_bookmakers": configured_odds_books(settings),
        "odds_sync_enabled": bool(settings.odds_sync_enabled),
    }


@router.get("/status")
def auth_status(
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_optional_user),
) -> dict:
    secret = auth_verification_enabled(settings)
    admin = False
    if user is not None:
        try:
            row = profiles.upsert_profile_for_user(db, user, settings)
            admin = bool(row.is_admin)
        except Exception:  # noqa: BLE001 — status should still answer when DB is down
            admin = is_admin_user(db, user)
    return {
        "auth_configured": secret,
        "auth_required_for_tips": bool(settings.auth_required_for_tips and secret),
        "signed_in": user is not None,
        "user_id": user.id if user else None,
        "email": user.email if user else None,
        "is_admin": admin,
        "message": (
            f"Signed in as {user.email or user.id}."
            if user
            else (
                "Auth ready — sign in on Me (web or Expo)."
                if secret
                else "Auth off (SUPABASE_JWT_SECRET not set). Tips work without login."
            )
        ),
    }


@router.get("/profile")
def get_profile(
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_optional_user),
) -> dict:
    me = _require_user(user)
    row = profiles.upsert_profile_for_user(db, me, settings)
    return profiles.profile_to_dict(row, include_details=True)


@router.patch("/profile")
def patch_profile(
    body: ProfileUpdateBody,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_optional_user),
) -> dict:
    me = _require_user(user)
    row = profiles.update_profile_details(
        db,
        me,
        settings,
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        address_line=body.address_line,
        city=body.city,
        state=body.state,
        country=body.country,
    )
    return profiles.profile_to_dict(row, include_details=True)
