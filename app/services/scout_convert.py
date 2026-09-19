"""
Phase 15D — cross-book convert for scouted codes (SportyBet ↔ Bet9ja).

Honest scope:
  We do NOT mint a new opaque booking code on the other book.
  When legs (or pasteable slip text) exist, we price-check the same
  markets on SportyBet / Bet9ja so you can rebuild the slip on the
  target book.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models.scout_code import ScoutedCode
from app.services.code_parse import parse_slip_text
from app.services.slip_convert import convert_slip


_BOOKS = ("sportybet", "bet9ja")


def _market_line(market: str | None, selection: str | None) -> str:
    m = (market or "").strip().lower()
    s = (selection or "").strip().lower()
    if m == "double_chance":
        return f"Double chance {s.upper()}"
    if m == "ou_2_5":
        return f"{'Over' if s == 'over' else 'Under'} 2.5"
    if m == "btts":
        return f"BTTS {'Yes' if s == 'yes' else 'No'}"
    if m == "1x2":
        return s.capitalize() if s else "1X2"
    if m and s:
        return f"{m} {s}"
    return s or m or ""


def slip_text_from_scout_row(row: ScoutedCode) -> str | None:
    """Rebuild pasteable slip text from stored legs or notes/title."""
    legs: list[dict[str, Any]] = []
    if row.legs_json:
        try:
            raw = json.loads(row.legs_json)
            if isinstance(raw, list):
                legs = [x for x in raw if isinstance(x, dict)]
        except (TypeError, json.JSONDecodeError):
            legs = []

    lines: list[str] = []
    for leg in legs:
        home = leg.get("home_hint")
        away = leg.get("away_hint")
        mkt = _market_line(leg.get("market"), leg.get("selection"))
        if home and away:
            lines.append(f"{home} vs {away}")
            if mkt:
                lines.append(mkt)
        elif leg.get("raw"):
            lines.append(str(leg["raw"]))
            if mkt and mkt.lower() not in str(leg["raw"]).lower():
                lines.append(mkt)

    text = "\n".join(lines).strip()
    if text and parse_slip_text(text):
        return text

    # Fall back to notes / title (Twitter paste often has readable legs)
    blob = "\n".join(x for x in (row.notes or "", row.title or "") if x).strip()
    if blob and parse_slip_text(blob):
        return blob
    return text or None


def can_convert_scout_row(row: ScoutedCode) -> bool:
    return slip_text_from_scout_row(row) is not None


def other_book(bookmaker: str) -> str:
    b = (bookmaker or "sportybet").strip().lower()
    return "bet9ja" if b == "sportybet" else "sportybet"


def convert_scouted_code(
    db: Session,
    row: ScoutedCode,
    *,
    target_book: str | None = None,
    days_ahead: int = 21,
) -> dict[str, Any]:
    """
    Cross-book price map for a scouted code.

    Returns convert_slip fields plus target_book / source_book / convertible messaging.
    """
    source = (row.bookmaker or "sportybet").strip().lower()
    target = (target_book or other_book(source)).strip().lower()
    if target not in _BOOKS:
        target = other_book(source)
    if source not in _BOOKS:
        source = "sportybet"

    slip = slip_text_from_scout_row(row)
    if not slip:
        return {
            "convertible": False,
            "source_book": source,
            "target_book": target,
            "code_text": row.code_text,
            "legs": [],
            "matched_count": 0,
            "combined_sportybet": None,
            "combined_bet9ja": None,
            "combined_best_mixed": None,
            "combined_target": None,
            "place_summary": "",
            "message": (
                f"Cannot convert {row.code_text}: no readable legs. "
                "Opaque codes stay book-specific — paste Team vs Team + markets "
                "(Tools → Compare slip), or refresh when notes include a slip."
            ),
        }

    result = convert_slip(
        db,
        slip_text=slip,
        code_text=row.code_text,
        source_book=source,
        days_ahead=days_ahead,
    )

    combined_target = (
        result.get("combined_bet9ja") if target == "bet9ja" else result.get("combined_sportybet")
    )
    matched = int(result.get("matched_count") or 0)
    target_label = "Bet9ja" if target == "bet9ja" else "SportyBet"
    source_label = "Bet9ja" if source == "bet9ja" else "SportyBet"

    header = [
        f"Cross-book convert · {source_label} → {target_label}",
        f"Source code: {row.code_text} (still {source_label} — not a new {target_label} booking code)",
        "Rebuild these legs on the target book and confirm live prices.",
        "",
    ]
    body = (result.get("place_summary") or "").strip()
    # Drop the generic first line from slip_convert if present
    body_lines = [ln for ln in body.splitlines() if not ln.startswith("Slip price-check")]
    place = "\n".join([*header, *body_lines]).strip()

    if matched == 0:
        msg = (
            f"Parsed legs for {row.code_text}, but none matched live {target_label} prices. "
            "Load matches, then try again closer to kickoff."
        )
    else:
        combo = f" Combined {target_label} ~ {combined_target}." if combined_target is not None else ""
        msg = (
            f"{matched} leg(s) priced for {target_label}.{combo} "
            "This is a rebuild plan — not a shareable booking code on the other book."
        )

    return {
        "convertible": True,
        "source_book": source,
        "target_book": target,
        "code_text": row.code_text,
        "slip_text": slip,
        "legs": result.get("legs") or [],
        "matched_count": matched,
        "combined_sportybet": result.get("combined_sportybet"),
        "combined_bet9ja": result.get("combined_bet9ja"),
        "combined_best_mixed": result.get("combined_best_mixed"),
        "combined_target": combined_target,
        "place_summary": place,
        "message": msg,
    }
