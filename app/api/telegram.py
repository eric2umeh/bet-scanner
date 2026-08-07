"""
Telegram test / notify helpers (Phase 4).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.services.telegram_notify import send_telegram_message, telegram_configured

router = APIRouter(prefix="/telegram", tags=["telegram"])


class TelegramTestRequest(BaseModel):
    text: str = Field(
        default="Bet Scanner online ✅ Phase 4 Telegram works.",
        max_length=4000,
    )


@router.get("/status")
def telegram_status(settings: Settings = Depends(get_settings)) -> dict:
    return {
        "configured": telegram_configured(settings),
        "enabled": settings.telegram_enabled,
        "chat_id_set": bool(settings.telegram_chat_id.strip()),
        "message": (
            "Telegram ready."
            if telegram_configured(settings)
            else "Set TELEGRAM_ENABLED=true, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID"
        ),
    }


@router.post("/test")
def telegram_test(
    body: TelegramTestRequest,
    settings: Settings = Depends(get_settings),
) -> dict:
    return send_telegram_message(settings, body.text)
