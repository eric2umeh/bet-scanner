#!/usr/bin/env bash
# Render dashboard Build Command (copy-paste this entire line):
#   pip install -r requirements.txt && chmod +x scripts/render_build.sh && ./scripts/render_build.sh
exec "$(dirname "$0")/scripts/render_build.sh" "$@"
