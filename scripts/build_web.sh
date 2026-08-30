#!/usr/bin/env bash
# Build Expo web into mobile/dist for FastAPI to serve at / (same UI as the phone app).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"

if ! command -v npm >/dev/null 2>&1; then
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

echo ""
echo "=============================================="
echo "  Next: hard-refresh http://127.0.0.1:8000/"
echo "  Re-run ./scripts/build_web.sh after any mobile UI change."
echo "=============================================="
