"""Unit checks for arb Phases B/C helpers (no DB)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

from app.services.ng_market_filters import is_ng_surebet_unreliable
from app.services.scan_arbitrage import (
    COVERAGE_PAIRS,
    DEFAULT_SUREBET_MARKETS,
    MARKET_OUTCOME_SETS,
    PHASE_A_MARKETS,
    PHASE_B_MARKETS,
    _finalize_opportunity,
)


def test_default_markets_include_team_totals_not_coverage():
    assert "tt_2_5_home" in DEFAULT_SUREBET_MARKETS
    assert "tt_2_5_away" in DEFAULT_SUREBET_MARKETS
    assert set(PHASE_A_MARKETS).issubset(DEFAULT_SUREBET_MARKETS)
    assert set(PHASE_B_MARKETS).issubset(DEFAULT_SUREBET_MARKETS)
    assert not any(m.startswith("coverage_") for m in DEFAULT_SUREBET_MARKETS)


def test_team_total_sets_require_both_sides():
    assert MARKET_OUTCOME_SETS["tt_2_5_home"] == ("home_over", "home_under")
    assert MARKET_OUTCOME_SETS["tt_2_5_away"] == ("away_over", "away_under")


def test_coverage_pairs_are_exclusive():
    assert len(COVERAGE_PAIRS) == 3
    ids = {p["id"] for p in COVERAGE_PAIRS}
    assert "coverage_dc_1x_vs_away" in ids
    # 1X + away covers H/D vs A; never DC+DC
    for p in COVERAGE_PAIRS:
        markets = {leg[0] for leg in p["legs"]}
        assert markets == {"double_chance", "1X2"}


def test_finalize_rejects_age_spread():
    now = datetime.now(timezone.utc)
    match = SimpleNamespace(
        id=1,
        home_team="A",
        away_team="B",
        competition_code="PL",
        kickoff_at=now + timedelta(hours=2),
    )
    legs = [
        {
            "bookmaker": "sportybet",
            "market": "ou_2_5",
            "selection": "over",
            "odds": Decimal("2.10"),
            "captured_at": now - timedelta(minutes=5),
        },
        {
            "bookmaker": "melbet",
            "market": "ou_2_5",
            "selection": "under",
            "odds": Decimal("2.10"),
            "captured_at": now - timedelta(minutes=80),
        },
    ]
    # Spread 75m > 40 → reject
    assert (
        _finalize_opportunity(
            match=match,
            market="ou_2_5",
            best_legs=legs,
            min_profit=Decimal("0.01"),
            sample_stake_ngn=Decimal("10000"),
            round_to=100,
            now=now,
            min_distinct_books=2,
            max_age_spread_minutes=40,
        )
        is None
    )


def test_finalize_accepts_fresh_cross_book():
    now = datetime.now(timezone.utc)
    match = SimpleNamespace(
        id=1,
        home_team="A",
        away_team="B",
        competition_code="PL",
        kickoff_at=now + timedelta(hours=2),
    )
    legs = [
        {
            "bookmaker": "sportybet",
            "market": "btts",
            "selection": "yes",
            "odds": Decimal("2.20"),
            "captured_at": now - timedelta(minutes=2),
        },
        {
            "bookmaker": "melbet",
            "market": "btts",
            "selection": "no",
            "odds": Decimal("2.20"),
            "captured_at": now - timedelta(minutes=3),
        },
    ]
    opp = _finalize_opportunity(
        match=match,
        market="btts",
        best_legs=legs,
        min_profit=Decimal("0.01"),
        sample_stake_ngn=Decimal("10000"),
        round_to=100,
        now=now,
        min_distinct_books=2,
        max_age_spread_minutes=40,
    )
    assert opp is not None
    assert opp["product"] == "surebet"
    assert len(opp["books_used"]) == 2


def test_ng_surebet_unreliable_filters_obscure_fixtures():
    assert is_ng_surebet_unreliable(
        "FC Bentonit",
        "Lernayin Artsakh FC",
        competition_code="UNK",
    )
    assert is_ng_surebet_unreliable(
        "Home U19",
        "Away U19",
        competition_code="YTH",
    )
    assert is_ng_surebet_unreliable(
        "A",
        "B",
        competition_name="Armenia. First League",
    )
    assert not is_ng_surebet_unreliable(
        "Arsenal",
        "Chelsea",
        competition_code="EPL",
        competition_name="Premier League",
    )
