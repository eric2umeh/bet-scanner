#!/usr/bin/env bash
# Render web service: Python API + Expo static export at /
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pip install -r requirements.txt

ensure_node() {
  if command -v npm >/dev/null 2>&1; then
    return
  fi
  NODE_VERSION="${NODE_VERSION:-20.18.0}"
  NODE_DIR="/tmp/node-v${NODE_VERSION}-linux-x64"
  if [[ ! -x "$NODE_DIR/bin/npm" ]]; then
    echo "render_build: installing Node.js v${NODE_VERSION} for Expo web export..."
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      | tar -xJ -C /tmp
  fi
  export PATH="$NODE_DIR/bin:$PATH"
}

ensure_node
chmod +x scripts/build_web.sh
RENDER=true APP_ENV=production ./scripts/build_web.sh

if [[ ! -f "$ROOT/mobile/dist/index.html" ]]; then
  echo "render_build: mobile/dist/index.html missing — Expo web export failed"
  exit 1
fi

echo "render_build: Expo web bundle ready ($(wc -c < "$ROOT/mobile/dist/index.html") bytes index.html)"
