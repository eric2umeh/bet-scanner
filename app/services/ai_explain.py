"""
Phase 5B — AI explain layer (optional LLM + template fallback).

Purpose:
  Explain picks from Safe Builder / value / surebets in plain English.
  The engines still decide WHAT to tip. AI only explains WHY / risk.

  Without AI_API_KEY → honest template text (still useful for learning).
  With key → OpenAI-compatible chat completions (OpenAI, Groq, etc.).
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import Settings


SYSTEM_PROMPT = """You help a Nigerian football bettor understand tip engine output.
Be clear, short, and honest. Never promise wins or sure profits.
Distinguish: Safe Builder (rules), value (soft price vs fair), surebet (all outcomes).
Use Naira (₦) when stakes appear. Max ~120 words unless asked for more."""


def ai_configured(settings: Settings) -> bool:
    key = (settings.ai_api_key or "").strip()
    return bool(
        settings.ai_enabled
        and key
        and key not in ("your_ai_api_key_here", "sk-xxx")
    )


def template_explain(pick: dict[str, Any], *, engine: str) -> str:
    """Deterministic explanation when no LLM key is set."""
    home = pick.get("home_team", "?")
    away = pick.get("away_team", "?")
    match = f"{home} vs {away}"
    engine = (engine or pick.get("source") or "tip").lower()

    if engine in ("safe_builder", "safe"):
        profile = pick.get("profile") or pick.get("risk_profile") or "safe"
        market = pick.get("market", "?")
        sel = pick.get("selection", "?")
        odds = pick.get("odds") or pick.get("odds_price") or "?"
        stake = pick.get("suggested_stake_ngn") or pick.get("stake_ngn") or "?"
        dog = pick.get("dog_odds")
        note = pick.get("learning_note") or pick.get("rationale") or ""
        lines = [
            f"Safe Builder pick: {match}",
            f"Rule profile: {profile}. Market {market} → {sel} @ {odds}.",
            f"Suggested stake ~₦{stake} (unit sizing from your bankroll).",
        ]
        if dog is not None:
            lines.append(f"Underdog price context: dog @ {dog}.")
        lines.append(
            "This is a rules-based safer slip — not a surebet and not +EV math."
        )
        if note:
            lines.append(str(note)[:200])
        return "\n".join(lines)

    if engine in ("value", "value_cross_book"):
        sel = pick.get("selection", "?")
        book = pick.get("bookmaker", "?")
        odds = pick.get("odds") or pick.get("odds_price") or "?"
        fair = pick.get("fair_odds", "?")
        ev = pick.get("ev_pct", "?")
        stake = pick.get("suggested_stake_ngn") or pick.get("stake_ngn") or "?"
        return "\n".join(
            [
                f"Value pick: {match}",
                f"{sel} @ {odds} on {book} vs fair ~{fair} (EV ~{ev}%).",
                f"Suggested stake ~₦{stake}.",
                "Positive EV means the price looks soft vs de-vigged consensus — "
                "you can still lose this match. Verify live before placing.",
            ]
        )

    if engine in ("arbitrage", "surebet", "arb"):
        profit = pick.get("profit_pct", "?")
        total = pick.get("sample_total_stake_ngn", "?")
        legs = pick.get("sample_legs") or pick.get("legs") or []
        leg_txt = "; ".join(
            f"{l.get('bookmaker')} {l.get('selection')}@{l.get('odds')}"
            for l in legs[:3]
        )
        return "\n".join(
            [
                f"Surebet: {match}",
                f"Theoretical profit ~{profit}% on total stake ₦{total}.",
                f"Legs: {leg_txt or '(see stake plan)'}.",
                "Profit only locks if ALL legs are placed at these odds before "
                "books move or void. High % edges are often stale — verify live.",
            ]
        )

    rationale = pick.get("rationale") or pick.get("warning") or ""
    return (
        f"Tip for {match}: {pick.get('selection', '?')} "
        f"({pick.get('market', '?')}). {rationale}"
    ).strip()


def llm_explain(
    settings: Settings,
    pick: dict[str, Any],
    *,
    engine: str,
    extra_question: str | None = None,
) -> tuple[str, str]:
    """
    Call OpenAI-compatible chat API.
    Returns (text, mode) where mode is 'llm' or raises.
    """
    base = (settings.ai_base_url or "https://api.openai.com/v1").rstrip("/")
    model = settings.ai_model or "gpt-4o-mini"
    key = settings.ai_api_key.strip()

    user_bits = {
        "engine": engine,
        "pick": pick,
        "question": extra_question
        or "Explain this tip for a beginner: what it is, why the engine chose it, and main risks.",
    }
    payload = {
        "model": model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(user_bits, default=str)[:6000],
            },
        ],
    }
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=45.0) as client:
        res = client.post(f"{base}/chat/completions", headers=headers, json=payload)
    if res.status_code >= 400:
        raise RuntimeError(
            f"AI API error {res.status_code}: {res.text[:300]}"
        )
    data = res.json()
    try:
        text = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError, AttributeError) as exc:
        raise RuntimeError(f"Unexpected AI response shape: {data!r}"[:400]) from exc
    if not text:
        raise RuntimeError("AI returned empty explanation")
    return text, "llm"


def explain_pick(
    settings: Settings,
    pick: dict[str, Any],
    *,
    engine: str = "safe_builder",
    prefer_llm: bool = True,
    extra_question: str | None = None,
) -> dict:
    """
    Explain one pick. Always returns usable text.
    mode: llm | template | llm_fallback
    """
    engine = (engine or "tip").strip().lower()
    template = template_explain(pick, engine=engine)

    if prefer_llm and ai_configured(settings):
        try:
            text, mode = llm_explain(
                settings, pick, engine=engine, extra_question=extra_question
            )
            return {
                "engine": engine,
                "mode": mode,
                "explanation": text,
                "template_fallback": template,
                "message": f"LLM explanation via {settings.ai_model}.",
            }
        except Exception as exc:  # noqa: BLE001 — always give learner a result
            return {
                "engine": engine,
                "mode": "llm_fallback",
                "explanation": template,
                "template_fallback": template,
                "message": f"LLM failed ({exc}); used template explanation.",
            }

    return {
        "engine": engine,
        "mode": "template",
        "explanation": template,
        "template_fallback": template,
        "message": (
            "Template explanation (set AI_ENABLED=true and AI_API_KEY for LLM)."
            if not ai_configured(settings)
            else "Template explanation (prefer_llm=false)."
        ),
    }
