"""Normalize bookmaker names from odds-api.io → internal keys."""

from __future__ import annotations

from app.config import Settings


def normalize_book_key(name: str) -> str:
    """Internal DB key (sportybet, onexbet, bet9ja)."""
    n = (name or "").strip().lower().replace(" ", "")
    if n in {"1xbet", "onexbet", "1xbit"}:
        return "onexbet"
    return n


def api_book_query_name(name: str) -> str:
    """Bookmaker string for odds-api.io query params (case-sensitive)."""
    n = (name or "").strip().lower().replace(" ", "")
    if n in {"1xbet", "onexbet"}:
        return "1xbet"
    if n == "sportybet":
        return "SportyBet"
    if n == "bet9ja":
        return "Bet9ja"
    return (name or "").strip()


def configured_odds_books(settings: Settings) -> list[str]:
    books = [normalize_book_key(b) for b in settings.odds_api_io_bookmakers_list]
    # de-dupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for b in books:
        if b and b not in seen:
            seen.add(b)
            out.append(b)
    return out
