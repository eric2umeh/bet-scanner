"""
FastAPI entrypoint.

Run from the project root:
  source .venv/bin/activate
  uvicorn app.main:app --reload

Then open:
  http://127.0.0.1:8000/      ← Expo web (same as phone; run ./scripts/build_web.sh)
  http://127.0.0.1:8000/legacy ← HTML dashboard
  http://127.0.0.1:8000/docs  ← API test panel (Swagger)
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.ai import router as ai_router
from app.api.arbitrage import router as arbitrage_router
from app.api.auth import router as auth_router
from app.api.convert import router as convert_router
from app.api.matches import router as matches_router
from app.api.odds import router as odds_router
from app.api.ops import router as ops_router
from app.api.predictions import router as predictions_router
from app.api.safe_builder import router as safe_builder_router
from app.api.telegram import router as telegram_router
from app.api.tips import router as tips_router
from app.api.tipsters import router as tipsters_router
from app.api.value import router as value_router
from app.config import get_settings
from app.db import init_db
from app.deps.auth import auth_verification_enabled
from app.middleware.api_key import AppApiKeyMiddleware

STATIC_DIR = Path(__file__).resolve().parent / "static"
EXPO_WEB_DIR = Path(__file__).resolve().parent.parent / "mobile" / "dist"
LEGACY_DASHBOARD = STATIC_DIR / "dashboard.html"


def expo_web_built() -> bool:
    return (EXPO_WEB_DIR / "index.html").is_file()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # On startup: make sure tables exist (matches, odds, tips)
    init_db()
    yield


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description=(
        "Football betting decision API — Expo web at / when built, "
        "legacy HTML at /legacy. API panel: /docs."
    ),
    version="0.12.0",
    lifespan=lifespan,
)

# Expo / React Native clients (LAN device, simulators, production web origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
# After CORS so preflight OPTIONS is not blocked by the key check.
app.add_middleware(AppApiKeyMiddleware)

app.include_router(auth_router)
app.include_router(matches_router)
app.include_router(odds_router)
app.include_router(arbitrage_router)
app.include_router(safe_builder_router)
app.include_router(predictions_router)
app.include_router(value_router)
app.include_router(ai_router)
app.include_router(tips_router)
app.include_router(tipsters_router)
app.include_router(convert_router)
app.include_router(ops_router)
app.include_router(telegram_router)


@app.get("/health")
def health() -> dict[str, str | bool]:
    """Lightweight liveness check for Render / load balancers."""
    return {
        "status": "ok",
        "env": settings.app_env,
        "version": app.version,
        "auth_configured": auth_verification_enabled(settings),
    }


@app.get("/favicon.png", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(STATIC_DIR / "favicon.png", media_type="image/png")


@app.get("/legacy", include_in_schema=False)
def legacy_dashboard() -> FileResponse:
    """Phase 10 HTML dashboard."""
    return FileResponse(LEGACY_DASHBOARD)


if expo_web_built():
    app.mount(
        "/",
        StaticFiles(directory=str(EXPO_WEB_DIR), html=True),
        name="expo-web",
    )
else:

    @app.get("/", include_in_schema=False)
    def dashboard_fallback() -> FileResponse:
        """Expo web not built — run: ./scripts/build_web.sh (legacy HTML until then)."""
        return FileResponse(LEGACY_DASHBOARD)
