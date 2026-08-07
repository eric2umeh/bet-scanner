"""
FastAPI entrypoint.

Run from the project root:
  source .venv/bin/activate
  uvicorn app.main:app --reload

Then open:
  http://127.0.0.1:8000/      ← simple dashboard (easiest)
  http://127.0.0.1:8000/docs  ← API test panel (Swagger)
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from app.api.arbitrage import router as arbitrage_router
from app.api.matches import router as matches_router
from app.api.odds import router as odds_router
from app.api.safe_builder import router as safe_builder_router
from app.config import get_settings
from app.db import init_db

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    # On startup: make sure tables exist (matches, odds, tips)
    init_db()
    yield


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description=(
        "Football betting decision API — Phase 3C: bankroll units + Safe Builder. "
        "Open / for a simple dashboard, or /docs for the API test panel."
    ),
    version="0.3.3",
    lifespan=lifespan,
)

app.include_router(matches_router)
app.include_router(odds_router)
app.include_router(arbitrage_router)
app.include_router(safe_builder_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    """Simple HTML UI for learners — no need to understand Swagger first."""
    return FileResponse(STATIC_DIR / "dashboard.html")
