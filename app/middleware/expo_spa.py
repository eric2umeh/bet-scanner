"""
Serve Expo web index.html for browser navigations to client-side routes.

Without this, GET /me (and refresh on /tips) hits StaticFiles or the JSON API
and users see a raw 404 / JSON instead of the React app.
"""

from __future__ import annotations

from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, Response

# Never hijack API, docs, or static asset paths.
_SKIP_PREFIXES = (
    "/_expo",
    "/assets",
    "/favicon",
    "/docs",
    "/redoc",
    "/openapi",
    "/health",
    "/legacy",
    "/privacy",
    "/auth",
    "/matches",
    "/odds",
    "/tips/",  # e.g. POST settle — keep API
    "/tipsters",
    "/value",
    "/arbitrage",
    "/convert",
    "/ops",
    "/ai",
    "/telegram",
    "/bankroll",
    "/predictions",
    "/safe-builder",
)


def _wants_html(request: Request) -> bool:
    accept = (request.headers.get("accept") or "").lower()
    if "application/json" in accept and "text/html" not in accept:
        return False
    return "text/html" in accept or "*/*" in accept


class ExpoSpaMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, expo_web_dir: Path):
        super().__init__(app)
        self._expo_web_dir = expo_web_dir
        self._index = expo_web_dir / "index.html"

    def _has_static_file(self, path: str) -> bool:
        rel = path.lstrip("/")
        if not rel:
            return False
        candidate = self._expo_web_dir / rel
        return candidate.is_file()

    async def dispatch(self, request: Request, call_next) -> Response:
        if (
            request.method == "GET"
            and self._index.is_file()
            and _wants_html(request)
        ):
            path = request.url.path or "/"
            if any(path.startswith(p) for p in _SKIP_PREFIXES):
                return await call_next(request)
            if not self._has_static_file(path):
                return FileResponse(self._index, media_type="text/html")
        return await call_next(request)
