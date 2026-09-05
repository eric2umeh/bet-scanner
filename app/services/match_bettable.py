"""Whether a match is still placeable as a new bet (Today / surebets / value)."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models import Match
from app.services.match_status import (
    VOIDABLE_MATCH_STATUSES,
    normalize_match_status,
)


def match_still_bettable(match: Match | None, *, now: datetime | None = None) -> bool:
    """
    False once kickoff has passed or the match is live / finished / voidable.

    Used so Today tips and surebets never advertise started games.
    """
    if match is None:
        return False
    clock = now or datetime.now(timezone.utc)
    if clock.tzinfo is None:
        clock = clock.replace(tzinfo=timezone.utc)
    else:
        clock = clock.astimezone(timezone.utc)

    status = normalize_match_status(match.status)
    if status in {"FINISHED", "IN_PLAY"} or status in VOIDABLE_MATCH_STATUSES:
        return False

    ko = match.kickoff_at
    if ko is None:
        return False
    if ko.tzinfo is None:
        ko = ko.replace(tzinfo=timezone.utc)
    else:
        ko = ko.astimezone(timezone.utc)
    return ko > clock
