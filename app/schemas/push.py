"""JSON shapes for Expo push registration."""

from pydantic import BaseModel, Field


class PushRegisterRequest(BaseModel):
    token: str = Field(min_length=10, max_length=255)
    platform: str = Field(default="unknown", max_length=32)
    notify_morning: bool | None = None
    notify_settled: bool | None = None


class PushUnregisterRequest(BaseModel):
    token: str | None = Field(default=None, max_length=255)


class PushStatusResponse(BaseModel):
    registered: bool
    devices: int
    notify_morning: bool | None = None
    notify_settled: bool | None = None
    message: str
