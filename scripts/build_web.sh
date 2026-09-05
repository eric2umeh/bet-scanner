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

# Load mobile/.env then repo root .env (Expo export does not always pick up .env on its own).
load_dotenv() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "$line" == export\ * ]]; then
      eval "$line"
    else
      export "$line"
    fi
  done < "$f"
}

load_dotenv "$ROOT/.env"
load_dotenv "$ROOT/mobile/.env"

# Empty EXPO_PUBLIC_API_URL → client uses window.location.origin (same host as the API).
# On a laptop build, never bake the Render URL into mobile/dist — otherwise
# http://127.0.0.1:8000/ talks to Render (cold starts / pool fights) instead of local uvicorn.
# Render deploys set RENDER=true and keep same-origin (empty) unless you override.
if [[ "${RENDER:-}" != "true" && -z "${BUILD_WEB_FORCE_REMOTE_API:-}" ]]; then
  if [[ -n "${EXPO_PUBLIC_API_URL:-}" ]]; then
    echo "build_web: clearing EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL} (local same-origin API)."
    echo "  Tip: phone Expo still uses mobile/.env; only the static / export is same-origin."
  fi
  export EXPO_PUBLIC_API_URL=""
else
  export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-}"
fi
export EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}"

# Bake server APP_API_KEY into the static web client when not set explicitly.
if [[ -z "${EXPO_PUBLIC_APP_API_KEY:-}" && -n "${APP_API_KEY:-}" ]]; then
  export EXPO_PUBLIC_APP_API_KEY="$APP_API_KEY"
fi
if [[ -n "${EXPO_PUBLIC_APP_API_KEY:-}" ]]; then
  echo "build_web: EXPO_PUBLIC_APP_API_KEY set for web export (Refresh/settle auth)."
else
  echo "build_web: WARNING — no EXPO_PUBLIC_APP_API_KEY / APP_API_KEY; web Refresh may 401 if Render has APP_API_KEY."
fi

if [[ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" || -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "build_web: WARNING — Supabase keys missing; web login at / will be disabled."
  echo "  Add EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY to mobile/.env"
  echo "  (or SUPABASE_URL + SUPABASE_ANON_KEY in root .env), then re-run this script."
else
  echo "build_web: Supabase URL configured for web export."
fi

npx expo export --platform web --clear

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
