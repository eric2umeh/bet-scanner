"""
Save normalized FixtureMatch rows into Postgres.

Learning note:
- Providers fetch + translate
- This module only talks to the database
- That split keeps each file easier to understand
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Match
from app.providers.base import FixtureMatch


def upsert_fixture(db: Session, fixture: FixtureMatch) -> Match:
    """
    Insert a match, or update it if (external_id, provider) already exists.

    Returns the Match ORM object (with id set).
    """
    existing = db.scalar(
        select(Match).where(
            Match.external_id == fixture.external_id,
            Match.provider == fixture.provider,
        )
    )

    if existing is None:
        match = Match(
            external_id=fixture.external_id,
            provider=fixture.provider,
            competition_code=fixture.competition_code,
            competition_name=fixture.competition_name,
            home_team=fixture.home_team,
            away_team=fixture.away_team,
            kickoff_at=fixture.kickoff_at,
            status=fixture.status,
            home_score=fixture.home_score,
            away_score=fixture.away_score,
        )
        db.add(match)
        db.flush()  # assign match.id without full commit yet
        return match

    existing.competition_code = fixture.competition_code or existing.competition_code
    existing.competition_name = fixture.competition_name or existing.competition_name
    existing.home_team = fixture.home_team
    existing.away_team = fixture.away_team
    existing.kickoff_at = fixture.kickoff_at
    existing.status = fixture.status or existing.status
    existing.home_score = fixture.home_score
    existing.away_score = fixture.away_score
    return existing
