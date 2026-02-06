"""Telemetry opt-in and manual trigger endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .telemetry import get_settings, set_enabled, send_daily_payload

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


class TelemetrySettingsPayload(BaseModel):
    enabled: bool


class TelemetryTriggerPayload(BaseModel):
    force: bool = False


@router.get("/settings")
def read_settings() -> dict:
    return {"settings": get_settings()}


@router.post("/settings")
def update_settings(payload: TelemetrySettingsPayload) -> dict:
    settings = set_enabled(payload.enabled)
    return {"settings": settings}


@router.post("/send")
async def trigger_send(payload: TelemetryTriggerPayload | None = None) -> dict:
    force = payload.force if payload else False
    try:
        sent = await send_daily_payload(force=force)
    except HTTPException:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        raise HTTPException(status_code=500, detail=f"Telemetry send failed: {exc}") from exc
    return {"sent": sent}
