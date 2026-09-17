"""Phase 14C — register Expo push tokens (morning digest + tip settled)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps.auth import AuthUser, get_optional_user
from app.models.push_token import PushToken
from app.schemas.push import PushRegisterRequest, PushStatusResponse, PushUnregisterRequest
from app.services import push_notify

router = APIRouter(prefix="/push", tags=["push"])


def _require_user(user: AuthUser | None) -> AuthUser:
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to manage push notifications.")
    return user


@router.get("/status", response_model=PushStatusResponse)
def push_status(
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_optional_user),
) -> PushStatusResponse:
    u = _require_user(user)
    rows = list(db.scalars(select(PushToken).where(PushToken.user_id == u.id)).all())
    if not rows:
        return PushStatusResponse(
            registered=False,
            devices=0,
            message="No devices registered yet.",
        )
    return PushStatusResponse(
        registered=True,
        devices=len(rows),
        notify_morning=any(r.notify_morning for r in rows),
        notify_settled=any(r.notify_settled for r in rows),
        message=f"{len(rows)} device(s) registered.",
    )


@router.post("/register", response_model=PushStatusResponse)
def push_register(
    body: PushRegisterRequest,
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_optional_user),
) -> PushStatusResponse:
    u = _require_user(user)
    try:
        push_notify.upsert_push_token(
            db,
            user_id=u.id,
            token=body.token,
            platform=body.platform,
            notify_morning=body.notify_morning,
            notify_settled=body.notify_settled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    rows = list(db.scalars(select(PushToken).where(PushToken.user_id == u.id)).all())
    return PushStatusResponse(
        registered=True,
        devices=len(rows),
        notify_morning=any(r.notify_morning for r in rows),
        notify_settled=any(r.notify_settled for r in rows),
        message="Push notifications enabled for this device.",
    )


@router.post("/unregister", response_model=PushStatusResponse)
def push_unregister(
    body: PushUnregisterRequest,
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_optional_user),
) -> PushStatusResponse:
    u = _require_user(user)
    n = push_notify.delete_push_token(db, user_id=u.id, token=body.token)
    rows = list(db.scalars(select(PushToken).where(PushToken.user_id == u.id)).all())
    return PushStatusResponse(
        registered=bool(rows),
        devices=len(rows),
        notify_morning=any(r.notify_morning for r in rows) if rows else None,
        notify_settled=any(r.notify_settled for r in rows) if rows else None,
        message=f"Removed {n} device registration(s).",
    )
