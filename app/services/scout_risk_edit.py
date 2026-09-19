"""
Phase 15C — safety / risk-edit suggestions for scouted codes.

Honest scope: edit *suggestions* only — we do not rewrite bookmaker codes.
Works best when legs are matched; falls back to folds/odds heuristics.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any


# Soft / weak thresholds (market fair % from 15B)
_WEAK_CONF = 52.0
_SOFT_CONF = 58.0
_KEEP_STRONGEST = 4
_LOTTERY_FOLDS = 8
_LOTTERY_ODDS = 40.0


def _fixture_label(leg: dict[str, Any]) -> str:
    home = leg.get("home_team") or leg.get("home_hint")
    away = leg.get("away_team") or leg.get("away_hint")
    if home and away:
        return f"{home} vs {away}"
    return (leg.get("raw") or "leg").strip()[:80]


def _mkt_label(leg: dict[str, Any]) -> str:
    m = (leg.get("market") or "?").replace("_", " ")
    s = leg.get("selection") or "?"
    return f"{m} {s}".strip()


def build_safety_edits(
    *,
    enriched_legs: list[dict[str, Any]] | None,
    folds: int | None,
    combined_odds: Decimal | float | None,
    risk_band: str | None,
    confidence_pct: float | None,
    verification: str | None,
) -> tuple[list[dict[str, Any]], str | None]:
    """
    Returns (edits, short_summary).

    Each edit: {kind, severity, title, detail, leg_index?}
    severity: high | medium | low
    """
    edits: list[dict[str, Any]] = []
    legs = enriched_legs or []
    band = (risk_band or "unknown").strip().lower()
    ver = (verification or "unverified").strip().lower()

    try:
        odds_f = float(combined_odds) if combined_odds is not None else None
    except (TypeError, ValueError):
        odds_f = None

    # --- Lottery / stretch whole-slip warnings (rich meta or scored) ---
    if band == "lottery" or (folds is not None and folds >= _LOTTERY_FOLDS) or (
        odds_f is not None and odds_f >= _LOTTERY_ODDS
    ):
        edits.append(
            {
                "kind": "lottery_warning",
                "severity": "high",
                "title": "Lottery slip",
                "detail": (
                    f"{folds or '?'} folds"
                    + (f" @ {odds_f:.0f}" if odds_f else "")
                    + " — cut to 3–4 stronger legs or split into 2 smaller slips."
                ),
            }
        )
    elif band == "stretch" or (folds is not None and folds >= 5) or (
        odds_f is not None and odds_f >= 10
    ):
        edits.append(
            {
                "kind": "stretch_warning",
                "severity": "medium",
                "title": "Stretch accumulator",
                "detail": "Combined price is greedy — drop the weakest leg or soften longshot markets.",
            }
        )

    matched = [
        (i, leg)
        for i, leg in enumerate(legs)
        if leg.get("status") == "matched" and leg.get("confidence_pct") is not None
    ]

    if not matched and ver == "unverified":
        return [], None

    # --- Same-match correlated legs ---
    by_match: dict[int, list[tuple[int, dict[str, Any]]]] = {}
    for i, leg in matched:
        mid = leg.get("match_id")
        if mid is None:
            continue
        by_match.setdefault(int(mid), []).append((i, leg))
    for mid, group in by_match.items():
        if len(group) < 2:
            continue
        labels = ", ".join(_mkt_label(g[1]) for g in group[:3])
        edits.append(
            {
                "kind": "correlated_same_match",
                "severity": "high",
                "title": "Same-match legs",
                "detail": (
                    f"{_fixture_label(group[0][1])}: {labels}. "
                    "Books may block this as a normal multi — use Bet Builder or pick one market."
                ),
                "leg_index": group[0][0],
            }
        )

    # --- Weak / soft legs ---
    weak: list[tuple[int, dict[str, Any], float]] = []
    for i, leg in matched:
        conf = float(leg["confidence_pct"])
        price = float(leg["price"]) if leg.get("price") is not None else None
        if conf < _WEAK_CONF or (price is not None and price >= 2.4):
            weak.append((i, leg, conf))
            edits.append(
                {
                    "kind": "drop_leg",
                    "severity": "high" if conf < _WEAK_CONF else "medium",
                    "title": f"Drop weak leg · {_fixture_label(leg)}",
                    "detail": (
                        f"{_mkt_label(leg)} looks soft"
                        + (f" (~{conf:.0f}% market lean" if conf else "")
                        + (f", @{price:.2f}" if price else "")
                        + "). Removing it usually helps the slip more than hoping."
                    ),
                    "leg_index": i,
                }
            )
        elif conf < _SOFT_CONF:
            soft_edit = _soften_suggestion(i, leg, conf)
            if soft_edit:
                edits.append(soft_edit)

        # Always offer soften for outright home/away win when soft-ish
        if (leg.get("market") or "").lower() == "1x2" and conf < 65:
            sel = (leg.get("selection") or "").lower()
            if sel in ("home", "away") and not any(
                e.get("kind") == "soften_market" and e.get("leg_index") == i for e in edits
            ):
                dc = "1X" if sel == "home" else "X2"
                edits.append(
                    {
                        "kind": "soften_market",
                        "severity": "medium",
                        "title": f"Soften to Double chance {dc}",
                        "detail": (
                            f"{_fixture_label(leg)} · winner {sel} → {dc} "
                            f"(safer cover if the favourite draws)."
                        ),
                        "leg_index": i,
                    }
                )

        if (leg.get("market") or "").lower() == "ou_2_5" and (
            leg.get("selection") or ""
        ).lower() == "over" and conf < 62:
            if not any(e.get("kind") == "soften_market" and e.get("leg_index") == i for e in edits):
                edits.append(
                    {
                        "kind": "soften_market",
                        "severity": "medium",
                        "title": "Soften Over 2.5 → Over 1.5",
                        "detail": (
                            f"{_fixture_label(leg)} · Over 2.5 is greedier; "
                            "Over 1.5 usually hits more often."
                        ),
                        "leg_index": i,
                    }
                )

    # --- Trim long multis to strongest legs ---
    if len(matched) >= _LOTTERY_FOLDS or (folds is not None and folds >= _LOTTERY_FOLDS):
        ranked = sorted(matched, key=lambda t: float(t[1]["confidence_pct"]), reverse=True)
        keep = ranked[:_KEEP_STRONGEST]
        drop_n = max(0, len(matched) - _KEEP_STRONGEST)
        if drop_n > 0:
            keep_names = "; ".join(_fixture_label(k[1]) for k in keep[:3])
            edits.append(
                {
                    "kind": "trim_folds",
                    "severity": "high",
                    "title": f"Keep strongest {_KEEP_STRONGEST} legs",
                    "detail": (
                        f"Drop ~{drop_n} weaker selection(s). Start with: {keep_names}"
                        + ("…" if len(keep) > 3 else "")
                        + "."
                    ),
                }
            )

    # Deduplicate by (kind, title)
    seen: set[tuple[str, str]] = set()
    unique: list[dict[str, Any]] = []
    for e in edits:
        key = (str(e.get("kind")), str(e.get("title")))
        if key in seen:
            continue
        seen.add(key)
        unique.append(e)

    # Cap noise — show the most useful first
    sev_rank = {"high": 0, "medium": 1, "low": 2}
    unique.sort(key=lambda e: (sev_rank.get(str(e.get("severity")), 9), str(e.get("kind"))))
    unique = unique[:6]

    summary = None
    if unique:
        high = sum(1 for e in unique if e.get("severity") == "high")
        if high:
            summary = f"{high} high-priority edit{'s' if high != 1 else ''}"
        else:
            summary = f"{len(unique)} safety suggestion{'s' if len(unique) != 1 else ''}"
        if confidence_pct is not None and ver == "legs":
            summary = f"{summary} · slip ~{confidence_pct:.0f}%"

    return unique, summary


def _soften_suggestion(i: int, leg: dict[str, Any], conf: float) -> dict[str, Any] | None:
    market = (leg.get("market") or "").lower()
    sel = (leg.get("selection") or "").lower()
    if market == "1x2" and sel in ("home", "away"):
        dc = "1X" if sel == "home" else "X2"
        return {
            "kind": "soften_market",
            "severity": "medium",
            "title": f"Soften to Double chance {dc}",
            "detail": (
                f"{_fixture_label(leg)} · ~{conf:.0f}% lean on winner — "
                f"{dc} covers a draw."
            ),
            "leg_index": i,
        }
    if market == "ou_2_5" and sel == "over":
        return {
            "kind": "soften_market",
            "severity": "medium",
            "title": "Soften Over 2.5 → Over 1.5",
            "detail": f"{_fixture_label(leg)} · Over 2.5 is soft (~{conf:.0f}%).",
            "leg_index": i,
        }
    return None
