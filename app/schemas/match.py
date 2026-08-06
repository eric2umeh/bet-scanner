"""
Pydantic schemas = what the API sends/receives as JSON.

Learning note:
- SQLAlchemy models talk to the database
- Pydantic schemas talk to the outside world (Postman, frontend, Telegram)
- Keeping them separate is a scalable habit
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    external_id: str
    provider: str
    competition_code: str
    competition_name: str
    home_team: str
    away_team: str
    kickoff_at: datetime
    status: str
    home_score: int | None
    away_score: int | None


class SyncResult(BaseModel):
    competitions: list[str]
    upserted: int
    message: str
    providers: list[str] = []
