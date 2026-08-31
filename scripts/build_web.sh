#!/usr/bin/env bash
# Build Expo web into mobile/dist for FastAPI to serve at / (same UI as the phone app).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"

if ! command -v npm >/dev/null 2>&1; then
  if [[ "${RENDER:-}" == "true" || "${APP_ENV:-}" == "production" ]]; then
    echo "build_web: npm is required to build Expo web for / but was not found."
    exit 1
  fi
  echo "build_web: npm not found — skipping Expo web export (legacy dashboard at /legacy only)."
  exit 0
fi

if [[ ! -f package.json ]]; then
  echo "build_web: mobile/package.json missing"
  exit 1
fi

npm install

# Empty EXPO_PUBLIC_API_URL → client uses window.location.origin (same host as the API).
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-}"
export EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}"

npx expo export --platform web

DIST="$ROOT/mobile/dist"
ICO_SRC="$ROOT/mobile/assets/images/favicon.png"
if [[ -f "$ICO_SRC" && -d "$DIST" ]]; then
  # Expo export can keep a stale favicon.ico — regenerate from our PNG.
  npx --yes png-to-ico "$ICO_SRC" > "$DIST/favicon.ico"
  cp "$ICO_SRC" "$DIST/favicon.png"
  if [[ -f "$DIST/index.html" ]]; then
  perl -pi -e 's|href="/favicon\.ico"|href="/favicon.ico?v='$(date +%s)'"|' "$DIST/index.html" 2>/dev/null || \
    sed -i.bak 's|href="/favicon.ico"|href="/favicon.ico?v='"$(date +%s)"'"|' "$DIST/index.html" && rm -f "$DIST/index.html.bak"
  fi
fi

echo ""
echo "=============================================="
echo "  Next: hard-refresh http://127.0.0.1:8000/"
echo "  Re-run ./scripts/build_web.sh after any mobile UI change."
echo "=============================================="
