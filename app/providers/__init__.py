"""
External data providers (fixtures + odds).

Learning note:
- Our app should NOT depend on one website forever.
- Each provider knows how to talk to ONE external API.
- They all return the SAME internal shapes (see base.py),
  so sync code and the database stay stable when we add SportyBet later.
"""

from app.providers.base import FixtureMatch, OddQuote

__all__ = ["FixtureMatch", "OddQuote"]