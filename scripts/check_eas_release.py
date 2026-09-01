#!/usr/bin/env python3
"""
Phase 14A — preflight before eas build --profile production.

  python scripts/check_eas_release.py

Does not print secret values. Exit 0 = ready to try EAS build.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOBILE = ROOT / "mobile"


def _ok(msg: str) -> None:
    print(f"[OK] {msg}")


def _warn(msg: str) -> None:
    print(f"[WARN] {msg}")


def _fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def main() -> int:
    ok = True

    eas_path = MOBILE / "eas.json"
    app_path = MOBILE / "app.config.js"
    privacy = ROOT / "app" / "static" / "privacy.html"

    if not eas_path.is_file():
        _fail("mobile/eas.json missing")
        ok = False
    else:
        eas = json.loads(eas_path.read_text())
        prod = eas.get("build", {}).get("production", {})
        if prod.get("android", {}).get("buildType") != "app-bundle":
            _fail("production android.buildType should be app-bundle for Play Store")
            ok = False
        else:
            _ok("eas.json production → Android App Bundle (AAB)")

    if not app_path.is_file():
        _fail("mobile/app.config.js missing")
        ok = False
    else:
        import subprocess

        try:
            raw = subprocess.check_output(
                ['node', '-p', 'JSON.stringify(require("./app.config.js").expo)'],
                cwd=MOBILE,
                text=True,
            )
            app = json.loads(raw)
        except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
            _fail(f"mobile/app.config.js invalid: {exc}")
            ok = False
            app = {}
        if app:
            pkg = app.get("android", {}).get("package")
            bid = app.get("ios", {}).get("bundleIdentifier")
            if pkg != "com.betscanner.app":
                _warn(f"android.package is {pkg!r} (expected com.betscanner.app)")
            else:
                _ok(f"android.package={pkg}")
            if bid != "com.betscanner.app":
                _warn(f"ios.bundleIdentifier is {bid!r}")
            else:
                _ok(f"ios.bundleIdentifier={bid}")
            pid = (app.get("extra") or {}).get("eas", {}).get("projectId")
            if not pid:
                _fail("expo.extra.eas.projectId missing — run: cd mobile && eas init")
                ok = False
            else:
                _ok("Expo projectId configured")

    for name in ("icon.png", "adaptive-icon.png", "splash-icon.png"):
        p = MOBILE / "assets" / "images" / name
        if not p.is_file():
            _fail(f"missing {p.relative_to(ROOT)}")
            ok = False
        else:
            _ok(f"asset {name}")

    if privacy.is_file():
        _ok("privacy policy at app/static/privacy.html → /privacy when API is deployed")
    else:
        _fail("privacy.html missing")
        ok = False

    env_example = MOBILE / ".env.example"
    if env_example.is_file():
        _ok("mobile/.env.example documents EXPO_PUBLIC_* for EAS secrets")

    sa = MOBILE / "google-play-service-account.json"
    if sa.is_file():
        _ok("google-play-service-account.json present (for eas submit)")
    else:
        _warn("google-play-service-account.json not found — needed only for eas submit, not eas build")

    print()
    print("Next (Android Play Store):")
    print("  1) Deploy API so https://YOUR_HOST/privacy works")
    print("  2) cd mobile && eas login")
    print("  3) eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://YOUR_HOST")
    print("  4) eas secret:create … EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (if using login)")
    print("  5) npm run build:production")
    print("  6) Play Console → create app → upload AAB → internal testing")
    print("  See docs/PHASE_14A_PLAY_STORE.txt")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
