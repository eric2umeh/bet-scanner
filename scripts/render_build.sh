#!/usr/bin/env bash
# Render web service: Python API + Expo static export at /
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=============================================="
echo "  render_build: START (bet-scanner)"
echo "  ROOT=$ROOT"
echo "=============================================="

pip install -r requirements.txt

ensure_node() {
  if command -v npm >/dev/null 2>&1; then
    echo "render_build: npm $(npm --version) at $(command -v npm)"
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
  echo "render_build: npm $(npm --version) (from tarball)"
}

ensure_node
chmod +x scripts/build_web.sh
export RENDER=true
export APP_ENV=production
./scripts/build_web.sh

if [[ ! -f "$ROOT/mobile/dist/index.html" ]]; then
  echo "render_build: FATAL — mobile/dist/index.html missing after Expo export"
  exit 1
fi

echo "=============================================="
echo "  render_build: OK — Expo web at mobile/dist"
echo "  index.html size: $(wc -c < "$ROOT/mobile/dist/index.html") bytes"
echo "  /health should report expo_web_built: true"
echo "=============================================="
