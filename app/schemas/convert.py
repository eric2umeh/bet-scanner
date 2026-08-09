"""Phase 10E — assisted slip / booking-code price-check."""

from decimal import Decimal

from pydantic import BaseModel, Field


class SlipConvertRequest(BaseModel):
    """
    Paste a human-readable slip (not a magic SportyBet code decode).

    Example slip_text:
      Flamengo vs Vitoria
      Double chance 1X
      Over 2.5
      BTTS No
    """

    slip_text: str = Field(
        ...,
        min_length=3,
        max_length=4000,
        examples=["Flamengo vs Vitoria\nDouble chance 1X\nOver 2.5\nBTTS No"],
    )
    code_text: str | None = Field(
        default=None,
        description="Optional opaque booking code to keep with the summary",
        max_length=128,
    )
    source_book: str | None = Field(
        default="sportybet",
        description="Book the slip came from (for messaging only)",
    )
    days_ahead: int = Field(default=21, ge=1, le=60)


class LegPriceOut(BaseModel):
    bookmaker: str
    price: Decimal | None = None


class ConvertedLegOut(BaseModel):
    raw: str
    market: str | None = None
    selection: str | None = None
    match_id: int | None = None
    home_team: str | None = None
    away_team: str | None = None
    competition_code: str | None = None
    kickoff_at: str | None = None
    match_score: float | None = None
    prices: dict[str, Decimal | None] = Field(default_factory=dict)
    best_book: str | None = None
    best_price: Decimal | None = None
    status: str  # matched | no_odds | unmatched_match | unparsed


class SlipConvertResponse(BaseModel):
    legs: list[ConvertedLegOut]
    matched_count: int
    combined_sportybet: Decimal | None = None
    combined_bet9ja: Decimal | None = None
    combined_best_mixed: Decimal | None = None
    place_summary: str
    code_text: str | None = None
    message: str
