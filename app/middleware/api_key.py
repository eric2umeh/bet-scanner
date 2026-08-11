"""
Phase 12A — optional APP_API_KEY gate for mutating requests.

When APP_API_KEY is empty, all routes stay open (local / learning default).
When set, POST/PUT/PATCH/DELETE must send:
  X-API-Key: <key>

Authorization: Bearer is reserved for Supabase user login (Phase 12C).

GET /health, docs, and the HTML dashboard stay public.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import get_settings

_OPEN_PREFIXES = (
    "/docs",
    "/redoc",
    "/openapi.json",
    "/health",
)

_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def _extract_key(request: Request) -> str:
    return (request.headers.get("x-api-key") or "").strip()


class AppApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method not in _MUTATING:
            return await call_next(request)

        path = request.url.path or "/"
        if path == "/" or any(path == p or path.startswith(p + "/") for p in _OPEN_PREFIXES):
            return await call_next(request)

        expected = (get_settings().app_api_key or "").strip()
        if not expected:
            return await call_next(request)

        provided = _extract_key(request)
        if not provided:
            return JSONResponse(
                status_code=401,
                content={
                    "detail": (
                        "This action needs your app access key. "
                        "Add header X-API-Key (set APP_API_KEY on the server)."
                    )
                },
            )
        if provided != expected:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid app access key."},
            )
        return await call_next(request)
