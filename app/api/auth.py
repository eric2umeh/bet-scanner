"""
Phase 12C — auth status helpers (login itself is done by Supabase client).
"""

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.deps.auth import AuthUser, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
def auth_status(
    settings: Settings = Depends(get_settings),
    user: AuthUser | None = Depends(get_current_user),
) -> dict:
    secret = bool((settings.supabase_jwt_secret or "").strip())
    return {
        "auth_configured": secret,
        "auth_required_for_tips": bool(settings.auth_required_for_tips and secret),
        "signed_in": user is not None,
        "user_id": user.id if user else None,
        "email": user.email if user else None,
        "message": (
            f"Signed in as {user.email or user.id}."
            if user
            else (
                "Auth ready — sign in on the phone Me tab."
                if secret
                else "Auth off (SUPABASE_JWT_SECRET not set). Tips work without login."
            )
        ),
    }
