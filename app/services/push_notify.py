"""Phase 14C — Expo push notifications (morning digest + tip settled)."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.push_token import PushToken

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
# Expo accepts batches; keep under ~100.
_BATCH = 80


def upsert_push_token(
    db: Session,
    *,
    user_id: str,
    token: str,
    platform: str = "unknown",
    notify_morning: bool | None = None,
    notify_settled: bool | None = None,
) -> PushToken:
    tok = (token or "").strip()
    if not tok:
        raise ValueError("Push token is required.")
    row = db.scalars(select(PushToken).where(PushToken.token == tok)).first()
    if row is None:
        row = PushToken(
            user_id=user_id,
            token=tok,
            platform=(platform or "unknown")[:32],
            notify_morning=True if notify_morning is None else bool(notify_morning),
            notify_settled=True if notify_settled is None else bool(notify_settled),
        )
        db.add(row)
    else:
        row.user_id = user_id
        row.platform = (platform or row.platform or "unknown")[:32]
        if notify_morning is not None:
            row.notify_morning = bool(notify_morning)
        if notify_settled is not None:
            row.notify_settled = bool(notify_settled)
    db.commit()
    db.refresh(row)
    return row


def delete_push_token(db: Session, *, user_id: str, token: str | None = None) -> int:
    q = select(PushToken).where(PushToken.user_id == user_id)
    if token:
        q = q.where(PushToken.token == token.strip())
    rows = list(db.scalars(q).all())
    for row in rows:
        db.delete(row)
    db.commit()
    return len(rows)


def list_tokens(
    db: Session,
    *,
    morning: bool | None = None,
    settled: bool | None = None,
    user_ids: set[str] | None = None,
) -> list[PushToken]:
    q = select(PushToken)
    if morning is True:
        q = q.where(PushToken.notify_morning.is_(True))
    if settled is True:
        q = q.where(PushToken.notify_settled.is_(True))
    if user_ids is not None:
        if not user_ids:
            return []
        q = q.where(PushToken.user_id.in_(list(user_ids)))
    return list(db.scalars(q).all())


def _prune_bad_tokens(db: Session, tokens: list[str]) -> int:
    if not tokens:
        return 0
    rows = list(db.scalars(select(PushToken).where(PushToken.token.in_(tokens))).all())
    for row in rows:
        db.delete(row)
    if rows:
        db.commit()
    return len(rows)


def send_expo_push(
    db: Session,
    *,
    tokens: list[str],
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send via Expo's free push gateway. Removes DeviceNotRegistered tokens."""
    unique: list[str] = []
    seen: set[str] = set()
    for t in tokens:
        tok = (t or "").strip()
        if not tok or tok in seen:
            continue
        seen.add(tok)
        unique.append(tok)
    if not unique:
        return {"ok": True, "sent": 0, "message": "No push tokens."}

    payload_data = data or {}
    sent = 0
    errors: list[str] = []
    bad: list[str] = []

    with httpx.Client(timeout=30.0) as client:
        for i in range(0, len(unique), _BATCH):
            chunk = unique[i : i + _BATCH]
            messages = [
                {
                    "to": tok,
                    "title": title,
                    "body": body,
                    "sound": "default",
                    "data": payload_data,
                }
                for tok in chunk
            ]
            try:
                resp = client.post(
                    EXPO_PUSH_URL,
                    json=messages,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                )
                resp.raise_for_status()
                payload = resp.json()
            except Exception as exc:  # noqa: BLE001
                errors.append(str(exc))
                continue

            tickets = payload.get("data") or []
            if not isinstance(tickets, list):
                tickets = [tickets]
            for tok, ticket in zip(chunk, tickets):
                if not isinstance(ticket, dict):
                    continue
                if ticket.get("status") == "ok":
                    sent += 1
                    continue
                details = ticket.get("details") or {}
                err = ticket.get("message") or details.get("error") or "push failed"
                if details.get("error") == "DeviceNotRegistered":
                    bad.append(tok)
                else:
                    errors.append(f"{tok[:24]}…: {err}")

    pruned = _prune_bad_tokens(db, bad)
    ok = sent > 0 or (not errors and not unique)
    msg = f"Push sent to {sent} device(s)."
    if pruned:
        msg += f" Removed {pruned} stale token(s)."
    if errors:
        msg += f" {len(errors)} error(s)."
    return {
        "ok": ok or sent > 0,
        "sent": sent,
        "pruned": pruned,
        "errors": errors[:10],
        "message": msg,
    }


def notify_morning_digest(
    db: Session,
    *,
    summary: str,
    safe_count: int | None = None,
    settled_count: int | None = None,
) -> dict[str, Any]:
    rows = list_tokens(db, morning=True)
    bits = [summary.strip() or "Morning update ready."]
    if safe_count is not None:
        bits.append(f"{safe_count} safe tip(s) in brief.")
    if settled_count:
        bits.append(f"{settled_count} tip(s) settled.")
    body = " ".join(bits)[:180]
    return send_expo_push(
        db,
        tokens=[r.token for r in rows],
        title="Bet Scout — morning update",
        body=body,
        data={"type": "morning_digest", "screen": "home"},
    )


def notify_tips_settled(db: Session, settle_result: dict[str, Any] | None) -> dict[str, Any]:
    """Per-user alerts after auto-settle (won/lost/void)."""
    if not settle_result:
        return {"ok": True, "sent": 0, "message": "No settle result."}

    by_owner: dict[str, list[dict]] = defaultdict(list)
    for tip in (settle_result.get("settled") or []) + (settle_result.get("voided") or []):
        if not isinstance(tip, dict):
            continue
        owner = tip.get("owner_id")
        if owner:
            by_owner[str(owner)].append(tip)

    if not by_owner:
        return {
            "ok": True,
            "sent": 0,
            "message": "No owned tips settled (skip push).",
        }

    total_sent = 0
    parts: list[str] = []
    for owner_id, tips in by_owner.items():
        won = sum(1 for t in tips if (t.get("result") or "").lower() == "won")
        lost = sum(1 for t in tips if (t.get("result") or "").lower() == "lost")
        voided = sum(1 for t in tips if (t.get("result") or "").lower() == "void")
        chunks = []
        if won:
            chunks.append(f"{won} won")
        if lost:
            chunks.append(f"{lost} lost")
        if voided:
            chunks.append(f"{voided} void")
        detail = ", ".join(chunks) if chunks else f"{len(tips)} updated"
        body = f"{len(tips)} tip(s) settled — {detail}."
        rows = list_tokens(db, settled=True, user_ids={owner_id})
        result = send_expo_push(
            db,
            tokens=[r.token for r in rows],
            title="Bet Scout — tips settled",
            body=body[:180],
            data={"type": "tips_settled", "screen": "tips"},
        )
        total_sent += int(result.get("sent") or 0)
        parts.append(f"{owner_id[:8]}…:{result.get('sent', 0)}")

    return {
        "ok": True,
        "sent": total_sent,
        "message": f"Settled push: {total_sent} device(s) ({'; '.join(parts)[:120]}).",
        "owners": len(by_owner),
    }
