"""
Nigerian bookmaker scan filters — youth leagues, suspended markets, acca limits.

We cannot call SportyBet directly; odds-api.io may still return prices for markets
the book has since disabled. We drop obvious bad rows before showing tips.
"""

from __future__ import annotations

import re

# SportyBet often disables O/U + BTTS and blocks accas on youth / reserve fixtures.
_YOUTH_RE = re.compile(
    r"\b(u\d{2}|u\d{1})\b|youth|reserve|academy|"
    r"\b(junior|juniors)\b|"
    r"\bii\b|\bb\s+team\b",
    re.IGNORECASE,
)


def is_youth_or_reserve_match(
    home: str,
    away: str,
    *,
    competition_code: str | None = None,
    competition_name: str | None = None,
) -> bool:
    blob = " ".join(
        x for x in (home, away, competition_code or "", competition_name or "") if x
    )
    return bool(_YOUTH_RE.search(blob))


def singles_only_hint(home: str, away: str, **kw) -> str | None:
    """Short UI note when SportyBet usually allows singles only (no acca / bet builder)."""
    if is_youth_or_reserve_match(home, away, **kw):
        return (
            "Youth/reserve — SportyBet often singles-only; O/U & BTTS may be disabled live."
        )
    return None


def market_block_is_active(market: dict) -> bool:
    """True when odds-api.io (or similar) marks the market as open for betting."""
    if not isinstance(market, dict):
        return True
    if market.get("suspended") is True:
        return False
    if market.get("active") is False:
        return False
    status = str(market.get("status") or market.get("state") or "").lower().strip()
    if status in {"suspended", "closed", "disabled", "inactive", "locked"}:
        return False
    return True


def selection_price_active(raw) -> bool:
    """Skip null/zero/negative prices — common when a side is disabled on the book."""
    if raw is None:
        return False
    if isinstance(raw, str) and not raw.strip():
        return False
    try:
        return float(raw) > 1.0
    except (TypeError, ValueError):
        return False
