"""
Phase 12A — optional APP_API_KEY gate for mutating requests.

When APP_API_KEY is empty, all routes stay open (local / learning default).
When set, POST/PUT/PATCH/DELETE must send either:
  X-API-Key: <key>
  Authorization: Bearer <valid Supabase access token>

Signed-in users can sync/settle without pasting the developer access key.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import get_settings
from app.deps.auth import _decode_supabase_user, auth_verification_enabled

_OPEN_PREFIXES = (
    "/docs",
    "/redoc",
    "/openapi.json",
    "/health",
)

_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def _extract_key(request: Request) -> str:
    return (request.headers.get("x-api-key") or "").strip()


def _extract_bearer(request: Request) -> str:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


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
        if provided and provided == expected:
            return await call_next(request)

        # Signed-in users: valid Supabase JWT unlocks mutating routes
        settings = get_settings()
        bearer = _extract_bearer(request)
        if bearer and auth_verification_enabled(settings):
            user = _decode_supabase_user(bearer, settings)
            if user is not None:
                return await call_next(request)

        if not provided and not bearer:
            return JSONResponse(
                status_code=401,
                content={
                    "detail": (
                        "This action needs your app access key. "
                        "Add header X-API-Key (set APP_API_KEY on the server)."
                    )
                },
            )
        if provided and provided != expected:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid app access key."},
            )
        return JSONResponse(
            status_code=401,
            content={
                "detail": (
                    "Sign in on Me, or set the app access key, then try again."
                )
            },
        )
