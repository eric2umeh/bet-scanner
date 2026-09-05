"""JSON shapes for odds endpoints."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class OddOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    match_id: int
    bookmaker: str
    market: str
    selection: str
    price: Decimal
    captured_at: datetime


class OddsSyncResult(BaseModel):
    inserted: int
    matches_touched: int
    message: str
    ok: bool = True
    by_market: dict[str, int] = {}
    by_book: dict[str, int] = {}
