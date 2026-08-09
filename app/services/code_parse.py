"""
Light parsing helpers for tipster slips (Phase 6 + 10E).

SportyBet/Bet9ja booking codes are opaque — we cannot decode them without
the book’s API. This module:
  - normalizes the code string
  - extracts market hints from notes
  - parses human-readable slip text into legs (Phase 10E)
"""

from __future__ import annotations

import re
from dataclasses import dataclass


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


_VS_RE = re.compile(
    r"^\s*(.+?)\s+(?:vs\.?|v\.?)\s+(.+?)\s*$",
    re.I,
)

# Order matters — more specific patterns first
_LEG_MARKET_PATTERNS: list[tuple[re.Pattern[str], str, str | None]] = [
    (
        re.compile(
            r"\bdouble\s*chance\b[^a-z0-9]*(1x|x2|12)\b",
            re.I,
        ),
        "double_chance",
        None,  # selection from group 1
    ),
    (re.compile(r"\b(1x|x2|12)\b", re.I), "double_chance", None),
    (
        re.compile(
            r"\b(?:o/?u|over\s*/\s*under|over/?under)\s*2\.?5\b[^a-z]*(over|under)\b",
            re.I,
        ),
        "ou_2_5",
        None,
    ),
    (re.compile(r"\bover\s*2\.?5\b", re.I), "ou_2_5", "over"),
    (re.compile(r"\bunder\s*2\.?5\b", re.I), "ou_2_5", "under"),
    (
        re.compile(r"\bbtts\b[^a-z]*(yes|no|gg|ng)\b", re.I),
        "btts",
        None,
    ),
    (re.compile(r"\bboth\s*teams\s*to\s*score\b[^a-z]*(yes|no)\b", re.I), "btts", None),
    (re.compile(r"\b(home|draw|away)\b", re.I), "1x2", None),
    (re.compile(r"\b1x2\b[^a-z]*(home|draw|away)\b", re.I), "1x2", None),
]


@dataclass
class ParsedLeg:
    raw: str
    home_hint: str | None
    away_hint: str | None
    market: str | None
    selection: str | None


def _norm_sel(market: str, selection: str) -> str:
    s = selection.strip().lower()
    if market == "btts":
        if s in ("gg", "y"):
            return "yes"
        if s in ("ng", "n"):
            return "no"
    if market == "double_chance":
        return s.upper() if s in ("1x", "x2", "12") else s
    return s


def _extract_market(line: str) -> tuple[str | None, str | None]:
    for pattern, market, fixed_sel in _LEG_MARKET_PATTERNS:
        m = pattern.search(line)
        if not m:
            continue
        if fixed_sel is not None:
            return market, _norm_sel(market, fixed_sel)
        # Prefer last capturing group if present
        if m.lastindex:
            return market, _norm_sel(market, m.group(m.lastindex))
        return market, None
    return None, None


def _split_vs_tail(away_side: str) -> tuple[str, str | None]:
    """
    'Vitoria Double chance 1X' → ('Vitoria', 'Double chance 1X')
    Keep team name; leftover becomes market fragment.
    """
    # Strip trailing @ odds
    away_side = re.sub(r"\s*@\s*[\d.]+\s*$", "", away_side).strip()
    market, sel = _extract_market(away_side)
    if market is None:
        return away_side.strip(), None
    # Cut market keywords from team name
    cut = re.split(
        r"\b(?:double\s*chance|o/?u|over/?under|btts|both\s*teams|1x2|over\s*2|under\s*2|\b1x\b|\bx2\b)\b",
        away_side,
        maxsplit=1,
        flags=re.I,
    )
    team = cut[0].strip(" -–—|")
    return team or away_side, away_side if market else None


def parse_slip_text(slip_text: str) -> list[ParsedLeg]:
    """
    Parse a human-readable multi-line slip into legs.

    Supported shapes:
      Flamengo vs Vitoria
      Double chance 1X
      Over 2.5
      BTTS No

      Flamengo vs Vitoria — 1X
      Flamengo vs Vitoria Over 2.5
    """
    text = (slip_text or "").strip()
    if not text:
        return []

    lines = [ln.strip() for ln in re.split(r"[\r\n]+", text) if ln.strip()]
    # Also allow " | " / " ; " as soft breaks inside one blob
    if len(lines) == 1 and ("|" in lines[0] or ";" in lines[0]):
        lines = [p.strip() for p in re.split(r"[|;]", lines[0]) if p.strip()]

    legs: list[ParsedLeg] = []
    cur_home: str | None = None
    cur_away: str | None = None

    for line in lines:
        cleaned = re.sub(r"\s*@\s*[\d.]+\s*$", "", line).strip()
        vs = _VS_RE.match(cleaned)
        if vs:
            home = vs.group(1).strip(" -–—|")
            away_raw = vs.group(2).strip()
            away, market_frag = _split_vs_tail(away_raw)
            cur_home, cur_away = home, away
            frag = market_frag or cleaned
            market, sel = _extract_market(frag)
            if market and sel:
                legs.append(
                    ParsedLeg(
                        raw=line,
                        home_hint=cur_home,
                        away_hint=cur_away,
                        market=market,
                        selection=sel,
                    )
                )
            continue

        market, sel = _extract_market(cleaned)
        if market and sel:
            legs.append(
                ParsedLeg(
                    raw=line,
                    home_hint=cur_home,
                    away_hint=cur_away,
                    market=market,
                    selection=sel,
                )
            )
            continue

        # Lone "Team A vs Team B" already handled; ignore noise lines
        if cur_home is None and " vs " not in cleaned.lower():
            # Maybe a title line — skip
            continue

    return legs
