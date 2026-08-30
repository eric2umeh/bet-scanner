"""
Phase 6 — tipsters + booking codes.
Phase 13B — scoped to signed-in user when logged in; writes respect AUTH_REQUIRED_FOR_TIPS.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.models.tipster import BookingCode
from app.db import get_db
from app.deps.auth import AuthUser, assert_resource_owner, get_current_user
from app.schemas.tipsters import (
    CodeCreate,
    CodeCreateResponse,
    CodeOut,
    CodeSettleRequest,
    LeaderboardResponse,
    TipsterCreate,
    TipsterOut,
)
from app.services.tipsters import (
    code_to_dict,
    create_tipster,
    get_tipster,
    list_codes,
    list_tipsters,
    settle_code,
    submit_code,
    tipster_leaderboard,
    tipster_to_dict,
)

router = APIRouter(prefix="/tipsters", tags=["tipsters"])


def _owner_scope(user: AuthUser | None) -> str | None:
    return user.id if user else None


@router.post("", response_model=TipsterOut, summary="Create a tipster profile")
def create_tipster_endpoint(
    body: TipsterCreate,
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> TipsterOut:
    t = create_tipster(
        db,
        name=body.name,
        handle=body.handle,
        platform=body.platform,
        notes=body.notes,
        owner_id=user.id if user else None,
    )
    return TipsterOut(**tipster_to_dict(t))


@router.get("", response_model=list[TipsterOut], summary="List tipsters")
def list_tipsters_endpoint(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> list[TipsterOut]:
    return [
        TipsterOut(**tipster_to_dict(t))
        for t in list_tipsters(db, limit=limit, owner_id=_owner_scope(user))
    ]


@router.get(
    "/leaderboard",
    response_model=LeaderboardResponse,
    summary="Verified tipster leaderboard (settled codes)",
)
def leaderboard_endpoint(
    min_settled: int = Query(default=1, ge=1, le=50),
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> LeaderboardResponse:
    return LeaderboardResponse(
        **tipster_leaderboard(db, min_settled=min_settled, owner_id=_owner_scope(user))
    )


@router.post(
    "/codes",
    response_model=CodeCreateResponse,
    summary="Submit a booking code / slip for a tipster",
)
def submit_code_endpoint(
    body: CodeCreate,
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> CodeCreateResponse:
    tipster = get_tipster(db, body.tipster_id)
    if tipster is None:
        raise HTTPException(status_code=404, detail="Tipster not found")
    assert_resource_owner(tipster.owner_id, user, action="log codes for this tipster")
    row, status = submit_code(
        db,
        tipster_id=body.tipster_id,
        code_text=body.code_text,
        bookmaker=body.bookmaker,
        stake_ngn=body.stake_ngn,
        odds_price=body.odds_price,
        source=body.source,
        notes=body.notes,
        markets_summary=body.markets_summary,
    )
    if status.startswith("error"):
        raise HTTPException(status_code=400, detail=status)
    return CodeCreateResponse(
        status=status,
        code=CodeOut(**code_to_dict(row)) if row else None,
        message=(
            "Code logged (pending settle)."
            if status == "created"
            else "Duplicate pending code — not re-logged."
        ),
    )


@router.get("/codes", response_model=list[CodeOut], summary="List booking codes")
def list_codes_endpoint(
    tipster_id: int | None = Query(default=None),
    result: str | None = Query(default=None, description="pending|won|lost|void"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> list[CodeOut]:
    return [
        CodeOut(**code_to_dict(c))
        for c in list_codes(
            db,
            tipster_id=tipster_id,
            result=result,
            limit=limit,
            owner_id=_owner_scope(user),
        )
    ]


@router.post(
    "/codes/{code_id}/settle",
    response_model=CodeOut,
    summary="Mark a booking code won/lost/void/pending",
)
def settle_code_endpoint(
    code_id: int,
    body: CodeSettleRequest,
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> CodeOut:
    existing = db.get(BookingCode, code_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Code not found")
    tipster = get_tipster(db, existing.tipster_id)
    if tipster:
        assert_resource_owner(tipster.owner_id, user, action="settle this code")
    row, status = settle_code(db, code_id, body.result)
    if status.startswith("error"):
        raise HTTPException(
            status_code=404 if "not found" in status else 400,
            detail=status,
        )
    assert row is not None
    return CodeOut(**code_to_dict(row))


@router.get("/{tipster_id}", response_model=TipsterOut)
def get_tipster_endpoint(
    tipster_id: int,
    db: Session = Depends(get_db),
    user: AuthUser | None = Depends(get_current_user),
) -> TipsterOut:
    t = get_tipster(db, tipster_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Tipster not found")
    if user and t.owner_id and t.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Tipster not found")
    return TipsterOut(**tipster_to_dict(t))
