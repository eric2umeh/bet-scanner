"""
Optional Telegram alerts (Phase 4).

Needs:
  TELEGRAM_ENABLED=true
  TELEGRAM_BOT_TOKEN=...
  TELEGRAM_CHAT_ID=...

Create a bot via @BotFather, then message it once and get chat id from:
  https://api.telegram.org/bot<TOKEN>/getUpdates
"""

from __future__ import annotations

import httpx

from app.config import Settings


def telegram_configured(settings: Settings) -> bool:
    return bool(
        settings.telegram_enabled
        and settings.telegram_bot_token.strip()
        and settings.telegram_chat_id.strip()
    )


def send_telegram_message(settings: Settings, text: str) -> dict:
    if not telegram_configured(settings):
        return {
            "ok": False,
            "message": (
                "Telegram not configured. Set TELEGRAM_ENABLED=true, "
                "TELEGRAM_BOT_TOKEN, and TELEGRAM_CHAT_ID in .env"
            ),
        }

    token = settings.telegram_bot_token.strip()
    chat_id = settings.telegram_chat_id.strip()
    bot_id = token.split(":", 1)[0]
    # Common mistake: paste the number before ":" from the bot token as chat id
    if chat_id == bot_id:
        return {
            "ok": False,
            "message": (
                "TELEGRAM_CHAT_ID is your BOT id, not your user chat. "
                "Open your bot in Telegram, tap Start / send hi, then open "
                "https://api.telegram.org/bot<TOKEN>/getUpdates and copy "
                "message.chat.id (your personal number — not the bot id)."
            ),
        }

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text[:4000],
        "disable_web_page_preview": True,
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.post(url, json=payload)
            data = res.json()
    except Exception as exc:  # noqa: BLE001 — surface to API caller
        return {"ok": False, "message": f"Telegram request failed: {exc}"}

    if not data.get("ok"):
        desc = data.get("description", data)
        hint = ""
        if "can't initiate conversation" in str(desc).lower() or "blocked" in str(desc).lower():
            hint = " — open the bot chat and tap Start first."
        elif "can't send messages to the bot" in str(desc).lower():
            hint = (
                " — TELEGRAM_CHAT_ID must be YOUR user/chat id from getUpdates, "
                "not the bot id."
            )
        return {
            "ok": False,
            "message": f"Telegram API error: {desc}{hint}",
        }
    return {"ok": True, "message": "Telegram message sent.", "telegram": data.get("result")}


def format_tips_digest(tips: list[dict], title: str = "Bet Scout picks") -> str:
    if not tips:
        return f"{title}\n(no picks)"
    lines = [title, ""]
    for t in tips[:15]:
        odds = t.get("odds_price") or t.get("odds") or "?"
        stake = t.get("stake_ngn") or t.get("suggested_stake_ngn") or "?"
        lines.append(
            f"• {t.get('home_team')} vs {t.get('away_team')}\n"
            f"  {t.get('risk_profile') or t.get('profile')}: "
            f"{t.get('market')} / {t.get('selection')} @ {odds}\n"
            f"  stake ₦{stake}"
        )
    if len(tips) > 15:
        lines.append(f"…and {len(tips) - 15} more")
    return "\n".join(lines)
