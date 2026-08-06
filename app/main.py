"""
FastAPI entrypoint.

Run from the project root (works/bet-scanner):
  source .venv/bin/activate
  uvicorn app.main:app --reload

Then open:
  http://127.0.0.1:8000/docs   ← interactive API docs (great for learning)
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.matches import router as matches_router
from app.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    # On startup: make sure tables exist
    init_db()
    yield
    # On shutdown: nothing special yet


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description=(
        "Football betting decision API — Phase 1: fixtures data spine. "
        "You are learning by building; start here, add odds/tips/ML later."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(matches_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}