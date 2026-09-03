"""
Learn from settled tips (won/lost) to rank future recommendations.

This is statistical feedback — not a crystal ball.
As you settle more tips, hit rates by market/profile steer confidence
and sort order on Safe Builder scans.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Tip

MIN_SAMPLE_SOFT = 3
MIN_SAMPLE_STRONG = 5


@dataclass
class BucketStats:
    won: int = 0
    lost: int = 0

    @property
    def settled(self) -> int:
        return self.won + self.lost

    @property
    def hit_rate_pct(self) -> float | None:
        if self.settled == 0:
            return None
        return round(100.0 * self.won / self.settled, 1)


@dataclass
class LearningModel:
    by_market: dict[str, BucketStats] = field(default_factory=dict)
    by_profile: dict[str, BucketStats] = field(default_factory=dict)
    by_dog_bucket: dict[str, BucketStats] = field(default_factory=dict)
    total_won: int = 0
    total_lost: int = 0
    preferred_pick_market: str = "double_chance"
    insights: list[str] = field(default_factory=list)

    @property
    def settled(self) -> int:
        return self.total_won + self.total_lost


def dog_bucket(dog_odds: Decimal | float | None) -> str:
    if dog_odds is None:
        return "unknown"
    o = float(dog_odds)
    if o <= 7:
        return "<=7"
    if o <= 10:
        return "7-10"
    if o <= 15:
        return "10-15"
    return ">15"


def _bump(table: dict[str, BucketStats], key: str, won: bool) -> None:
    stats = table.setdefault(key, BucketStats())
    if won:
        stats.won += 1
    else:
        stats.lost += 1


def build_learning_model(db: Session) -> LearningModel:
    tips = db.scalars(
        select(Tip).where(Tip.result.in_(("won", "lost")), Tip.source == "safe_builder")
    ).all()

    model = LearningModel()
    for tip in tips:
        won = tip.result == "won"
        if won:
            model.total_won += 1
        else:
            model.total_lost += 1

        market_key = "double_chance" if tip.market == "double_chance" else "1x2"
        # Prefer stored pick_market when present
        pm = getattr(tip, "pick_market", None) or market_key
        if pm not in ("double_chance", "1x2"):
            pm = market_key

        _bump(model.by_market, pm, won)
        _bump(model.by_profile, tip.risk_profile or "unknown", won)
        dog = getattr(tip, "dog_odds", None)
        _bump(model.by_dog_bucket, dog_bucket(dog), won)

    model.preferred_pick_market = _prefer_market(model)
    model.insights = _insights(model)
    return model


def _prefer_market(model: LearningModel) -> str:
    """Keep double_chance as default unless 1x2 clearly outperforms with enough data."""
    dc = model.by_market.get("double_chance", BucketStats())
    x2 = model.by_market.get("1x2", BucketStats())

    if dc.settled < MIN_SAMPLE_STRONG and x2.settled < MIN_SAMPLE_STRONG:
        return "double_chance"

    dc_rate = dc.hit_rate_pct if dc.settled else None
    x2_rate = x2.hit_rate_pct if x2.settled else None

    if (
        x2_rate is not None
        and x2.settled >= MIN_SAMPLE_STRONG
        and (dc_rate is None or x2_rate >= dc_rate + 10)
    ):
        return "1x2"
    return "double_chance"


def _insights(model: LearningModel) -> list[str]:
    lines: list[str] = []
    if model.settled == 0:
        lines.append(
            "No settled Safe Builder tips yet — mark Won/Lost after matches "
            "so the system can learn."
        )
        return lines

    overall = round(100.0 * model.total_won / model.settled, 1)
    lines.append(
        f"Overall Safe Builder hit rate: {overall}% "
        f"({model.total_won}/{model.settled} settled)."
    )

    for key in ("double_chance", "1x2"):
        s = model.by_market.get(key)
        if s and s.settled:
            lines.append(
                f"{key}: {s.hit_rate_pct}% hit rate ({s.won}/{s.settled})."
            )

    pref = model.preferred_pick_market
    lines.append(
        f"Learned preference: keep/default toward {pref} "
        f"(double chance stays safer until 1x2 clearly beats it)."
    )

    weak = [
        (name, s)
        for name, s in model.by_profile.items()
        if s.settled >= MIN_SAMPLE_STRONG and (s.hit_rate_pct or 0) < 40
    ]
    for name, s in weak:
        lines.append(
            f"Caution: profile '{name}' is weak historically "
            f"({s.hit_rate_pct}% on {s.settled} tips) — demoted in rankings."
        )

    return lines


def _shrunk_rate(stats: BucketStats | None, prior: float = 0.55) -> float:
    """Pull hit rate toward a prior until sample size grows."""
    if stats is None or stats.settled == 0:
        return prior
    strength = 5.0
    return (stats.won + prior * strength) / (stats.settled + strength)


def score_pick(pick: dict, model: LearningModel) -> dict:
    """
    Attach confidence fields from history.
    Returns confidence 0..100 and a short learning_note.
    """
    market = pick.get("market") or ""
    style = "double_chance" if market == "double_chance" else "1x2"
    profile = pick.get("profile") or "unknown"
    dog = pick.get("dog_odds")

    prior = 0.58 if style == "double_chance" else 0.48
    m_stats = model.by_market.get(style)
    p_stats = model.by_profile.get(profile)
    d_stats = model.by_dog_bucket.get(dog_bucket(dog))

    # Blend market + profile + dog-band history
    rate = (
        0.5 * _shrunk_rate(m_stats, prior)
        + 0.3 * _shrunk_rate(p_stats, prior)
        + 0.2 * _shrunk_rate(d_stats, prior)
    )
    confidence = round(100.0 * rate, 1)

    samples = (m_stats.settled if m_stats else 0) + (p_stats.settled if p_stats else 0)
    if samples < MIN_SAMPLE_SOFT:
        label = "unproven"
        note = "Not enough history yet — using rule defaults."
    elif confidence >= 58:
        label = "supported"
        note = (
            f"History supports this style "
            f"({style} ~{m_stats.hit_rate_pct if m_stats and m_stats.settled else 'n/a'}%)."
        )
    elif confidence >= 48:
        label = "neutral"
        note = "Mixed history — size stakes carefully."
    else:
        label = "weak"
        note = (
            f"History is weak for {style}/{profile} — "
            f"consider double chance or skip."
        )

    # Extra warning when user forces a historically bad style
    if (
        style == "1x2"
        and m_stats
        and m_stats.settled >= MIN_SAMPLE_STRONG
        and (m_stats.hit_rate_pct or 0) < 40
    ):
        label = "weak"
        note = (
            f"Your 1X2 tips are only {m_stats.hit_rate_pct}% "
            f"({m_stats.won}/{m_stats.settled}). Double chance is safer."
        )

    return {
        "confidence_pct": confidence,
        "confidence_label": label,
        "learning_note": note,
        "learned_market_hit_rate_pct": m_stats.hit_rate_pct if m_stats else None,
        "learned_profile_hit_rate_pct": p_stats.hit_rate_pct if p_stats else None,
    }


def enrich_picks_with_learning(
    picks: list[dict],
    model: LearningModel,
    *,
    hide_weak: bool = False,
) -> list[dict]:
    enriched = []
    for p in picks:
        meta = score_pick(p, model)
        row = {**p, **meta}
        # Soft stake haircut on historically weak styles
        if meta["confidence_label"] == "weak" and row.get("suggested_stake_ngn") is not None:
            stake = Decimal(str(row["suggested_stake_ngn"]))
            row["suggested_stake_ngn"] = (stake * Decimal("0.75")).quantize(Decimal("1"))
            row["learning_note"] += " Stake cut to 75% of normal unit."
        if hide_weak and meta["confidence_label"] == "weak" and model.settled >= MIN_SAMPLE_STRONG:
            continue
        # Prefer clearer underdogs when history is thin (safer DC default).
        dog = row.get("dog_odds")
        try:
            dog_f = float(dog) if dog is not None else None
        except (TypeError, ValueError):
            dog_f = None
        if (
            hide_weak
            and row.get("market") == "double_chance"
            and dog_f is not None
            and dog_f < 8.0
            and model.settled < MIN_SAMPLE_STRONG
        ):
            continue
        enriched.append(row)

    enriched.sort(
        key=lambda p: (
            -float(p.get("confidence_pct") or 0),
            0 if p.get("market") == "double_chance" else 1,
            float(p.get("dog_odds") or 99),
        )
    )
    return enriched


def learning_to_dict(model: LearningModel) -> dict:
    def pack(table: dict[str, BucketStats]) -> list[dict]:
        out = []
        for name, s in sorted(table.items()):
            out.append(
                {
                    "key": name,
                    "won": s.won,
                    "lost": s.lost,
                    "settled": s.settled,
                    "hit_rate_pct": s.hit_rate_pct,
                }
            )
        return out

    return {
        "settled": model.settled,
        "won": model.total_won,
        "lost": model.total_lost,
        "hit_rate_pct": (
            round(100.0 * model.total_won / model.settled, 1) if model.settled else None
        ),
        "preferred_pick_market": model.preferred_pick_market,
        "by_market": pack(model.by_market),
        "by_profile": pack(model.by_profile),
        "by_dog_bucket": pack(model.by_dog_bucket),
        "insights": model.insights,
        "message": (
            model.insights[0]
            if model.insights
            else "Learning from settled tips…"
        ),
    }
