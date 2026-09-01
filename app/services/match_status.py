"""
Shared match status vocabulary for fixtures + auto-settle.

API-Football: PST → POSTPONED, CANC/ABD → CANCELLED
odds-api.io: settled, cancelled (and live/pending)
"""

from __future__ import annotations

# Tips on these match statuses are auto-voided (stake returned in books; no result).
VOIDABLE_MATCH_STATUSES = frozenset(
    {"POSTPONED", "CANCELLED", "SUSPENDED", "ABANDONED"}
)

FINISHED_MATCH_STATUSES = frozenset({"FINISHED", "FT"})


def normalize_match_status(raw: str | None) -> str:
    s = (raw or "").strip().upper()
    if not s:
        return "SCHEDULED"
    if s in {"FT", "AET", "PEN", "SETTLED", "FINISHED"}:
        return "FINISHED"
    if s in {"PST", "POSTPONED", "DELAYED"}:
        return "POSTPONED"
    if s in {"CANC", "CANCELLED", "CANCELED", "ABD", "ABANDONED", "VOID"}:
        return "CANCELLED"
    if s in {"SUSP", "SUSPENDED"}:
        return "SUSPENDED"
    if s in {"NS", "TBD", "SCHEDULED", "TIMED", "PENDING"}:
        return "SCHEDULED"
    if s in {"1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "IN_PLAY"}:
        return "IN_PLAY"
    return s


def is_voidable_match_status(status: str | None) -> bool:
    return normalize_match_status(status) in VOIDABLE_MATCH_STATUSES


def void_reason_label(status: str | None) -> str:
    s = normalize_match_status(status)
    if s == "POSTPONED":
        return "match postponed"
    if s == "CANCELLED":
        return "match cancelled or abandoned"
    if s == "SUSPENDED":
        return "match suspended"
    return f"match {s.lower()}"
