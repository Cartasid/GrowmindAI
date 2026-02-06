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
    """Trigger telemetry data send with comprehensive error handling."""
    force = payload.force if payload else False
    try:
        sent = await send_daily_payload(force=force)
    except HTTPException:
        raise
    except ValueError as exc:
        # Validation errors from payload
        raise HTTPException(status_code=400, detail=f"Invalid request: {exc}") from exc
    except TimeoutError as exc:
        # Network timeout
        raise HTTPException(status_code=504, detail="Telemetry send timeout") from exc
    except (OSError, IOError) as exc:
        # Network errors
        raise HTTPException(status_code=502, detail="Network error") from exc
    except Exception as exc:
        # Unexpected errors
        import traceback
        logger.exception("Unexpected error during telemetry send")
        raise HTTPException(status_code=500, detail="Telemetry send failed") from exc
    return {"sent": sent}
