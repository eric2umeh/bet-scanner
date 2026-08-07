"""
Light parsing helpers for tipster slips (Phase 6).

SportyBet/Bet9ja booking codes are opaque — we cannot decode them without
the book’s API. This module only:
  - normalizes the code string
  - extracts simple market hints from optional free-text notes
"""

from __future__ import annotations

import re


_MARKET_HINTS = (
    (re.compile(r"\b1x\b", re.I), "double_chance:1X"),
    (re.compile(r"\bx2\b", re.I), "double_chance:X2"),
    (re.compile(r"\b12\b"), "double_chance:12"),
    (re.compile(r"\bover\s*2\.5\b", re.I), "totals:over_2.5"),
    (re.compile(r"\bunder\s*2\.5\b", re.I), "totals:under_2.5"),
    (re.compile(r"\bbtts\s*yes\b", re.I), "btts:yes"),
    (re.compile(r"\bbtts\s*no\b", re.I), "btts:no"),
    (re.compile(r"\bhome\b", re.I), "1x2:home"),
    (re.compile(r"\bdraw\b", re.I), "1x2:draw"),
    (re.compile(r"\baway\b", re.I), "1x2:away"),
)


def normalize_code(code: str) -> str:
    return " ".join((code or "").strip().split())


def parse_markets_summary(notes: str | None, code_text: str | None = None) -> str | None:
    """
    Pull market hints from notes (and code text if someone pasted a slip).
    Returns comma-separated tags or None.
    """
    blob = " ".join(x for x in (notes or "", code_text or "") if x).strip()
    if not blob:
        return None
    found: list[str] = []
    for pattern, tag in _MARKET_HINTS:
        if pattern.search(blob) and tag not in found:
            found.append(tag)
    return ", ".join(found) if found else None
