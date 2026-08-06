"""
FastAPI entrypoint.

Run from the project root:
  source .venv/bin/activate
  uvicorn app.main:app --reload

Then open:
  http://127.0.0.1:8000/docs   ← interactive API docs (great for learning)
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.matches import router as matches_router
from app.api.odds import router as odds_router
from app.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    # On startup: make sure tables exist (matches, odds, tips)
    init_db()
    yield


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description=(
        "Football betting decision API — Phase 2: fixtures + odds. "
        "Multi-provider design (football-data, API-Football, The Odds API). "
        "Learn by calling /docs endpoints."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

app.include_router(matches_router)
app.include_router(odds_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}
