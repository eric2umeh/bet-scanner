"""Admin-only user search + role toggle."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps.admin import require_admin
from app.deps.auth import AuthUser
from app.services import user_profiles as profiles

router = APIRouter(prefix="/admin/users", tags=["admin"])


class AdminFlagBody(BaseModel):
    is_admin: bool = Field(..., description="Grant or revoke admin role")


@router.get("")
def list_users(
    q: str | None = Query(None, description="Email search (partial)"),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    _admin: AuthUser = Depends(require_admin),
) -> dict:
    rows = profiles.list_profiles(db, q=q, limit=limit)
    return {"items": [profiles.profile_to_dict(r) for r in rows], "count": len(rows)}


@router.patch("/{user_id}")
def set_user_admin(
    user_id: str,
    body: AdminFlagBody,
    db: Session = Depends(get_db),
    _admin: AuthUser = Depends(require_admin),
) -> dict:
    try:
        row = profiles.set_admin(db, user_id=user_id, is_admin=body.is_admin)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return profiles.profile_to_dict(row)
