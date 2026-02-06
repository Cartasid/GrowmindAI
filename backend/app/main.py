import asyncio
import json
import logging
import math
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.websockets import WebSocketState

from .database import InvalidIdentifierError
from .plan_routes import router as plan_router
from .journal_routes import router as journal_router
from .ai_routes import router as ai_router
from .telemetry_routes import router as telemetry_router
from .nutrient_routes import router as nutrient_router
from .telemetry import telemetry_worker, shutdown_worker
from .utils import load_mapping

LOG_LEVEL = os.getenv("LOG_LEVEL", "info").upper()
logging.getLogger().setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)

_SENSITIVE_ENV_KEYS = ("SUPERVISOR_TOKEN", "HASS_TOKEN", "GEMINI_API_KEY", "TELEMETRY_API_KEY")


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(minimum, value)


def _env_float(name: str, default: float, *, minimum: float = 0.0) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    return max(minimum, value)


def _validate_hass_api_base(value: str) -> str:
    cleaned = (value or "").strip()
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError("HASS_API_BASE must be a valid http/https URL")
    return cleaned.rstrip("/")


def _parse_csv_env(name: str) -> List[str]:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _sensitive_values() -> List[str]:
    values = []
    for key in _SENSITIVE_ENV_KEYS:
        value = os.getenv(key)
        if value:
            values.append(value)
    return values


def _redact_message(message: str) -> str:
    redacted = message
    for value in _sensitive_values():
        if value:
            redacted = redacted.replace(value, "***")
    return redacted


class SensitiveValueFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        redacted = _redact_message(message)
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True


logging.getLogger().addFilter(SensitiveValueFilter())

HASS_API_BASE = _validate_hass_api_base(os.getenv("HASS_API_BASE", "http://supervisor/core/api"))
CORS_ALLOWED_ORIGINS = _parse_csv_env("CORS_ALLOWED_ORIGINS")
RATE_LIMIT_WINDOW_SECONDS = _env_float("RATE_LIMIT_WINDOW_SECONDS", 60.0, minimum=1.0)
RATE_LIMIT_MAX_REQUESTS = _env_int("RATE_LIMIT_MAX_REQUESTS", 120, minimum=0)
RATE_LIMIT_TRUSTED_IPS = set(_parse_csv_env("RATE_LIMIT_TRUSTED_IPS"))
WS_MAX_ERRORS = _env_int("WS_MAX_ERRORS", 6)

_rate_limit_lock = asyncio.Lock()
_rate_limit_store: Dict[str, Deque[float]] = defaultdict(deque)
_hass_lock = asyncio.Lock()
_notify_lock = asyncio.Lock()
_warned_missing_alerts = False

_telemetry_task: Optional[asyncio.Task[Any]] = None
_telemetry_stop: Optional[asyncio.Event] = None
_hass_client: Optional[httpx.AsyncClient] = None
_last_notify_time = 0.0

@asynccontextmanager
async def lifespan(application: FastAPI):
    global _telemetry_task, _telemetry_stop, _hass_client
    _hass_client = httpx.AsyncClient(
        base_url=HASS_API_BASE,
        timeout=httpx.Timeout(15.0),
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
    )
    _telemetry_stop = asyncio.Event()
    _telemetry_task = asyncio.create_task(telemetry_worker(_telemetry_stop))
    logger.info("GrowMind backend started — HA base: %s", HASS_API_BASE)
    yield
    if _telemetry_stop is not None:
        _telemetry_stop.set()
    await shutdown_worker(_telemetry_task)
    _telemetry_task = None
    _telemetry_stop = None
    if _hass_client is not None:
        await _hass_client.aclose()
        _hass_client = None


INGRESS_PATH = os.getenv("INGRESS_PATH", "")
app = FastAPI(title="GrowMind AI", lifespan=lifespan, root_path=INGRESS_PATH)
if CORS_ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ALLOWED_ORIGINS,
        allow_headers=["*"],
        allow_methods=["*"],
    )
else:
    logger.info("CORS_ALLOWED_ORIGINS not set; CORS middleware disabled.")


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if RATE_LIMIT_MAX_REQUESTS <= 0:
        return await call_next(request)
    client_ip = request.client.host if request.client else "unknown"
    if client_ip in RATE_LIMIT_TRUSTED_IPS:
        return await call_next(request)
    now = time.time()
    async with _rate_limit_lock:
        bucket = _rate_limit_store[client_ip]
        cutoff = now - RATE_LIMIT_WINDOW_SECONDS
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_MAX_REQUESTS:
            return JSONResponse({"detail": "Rate limit exceeded."}, status_code=429)
        bucket.append(now)
    return await call_next(request)


@app.exception_handler(InvalidIdentifierError)
async def invalid_identifier_handler(request: Request, exc: InvalidIdentifierError):
    return JSONResponse({"detail": str(exc)}, status_code=400)

app.include_router(plan_router)
app.include_router(journal_router)
app.include_router(ai_router)
app.include_router(telemetry_router)
app.include_router(nutrient_router)


class UpdatePayload(BaseModel):
    category: str
    role: str
    value: Any


MAPPING = load_mapping()

_UNAVAILABLE_STATES = frozenset({"unavailable", "unknown", "none", ""})


def _require_token() -> str:
    token = os.getenv("SUPERVISOR_TOKEN") or os.getenv("HASS_TOKEN")
    if not token:
        raise HTTPException(status_code=500, detail="Home Assistant token missing (SUPERVISOR_TOKEN/HASS_TOKEN)")
    return token


def _hass_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {_require_token()}",
        "Content-Type": "application/json",
    }


async def _hass() -> httpx.AsyncClient:
    global _hass_client
    if _hass_client is not None and not _hass_client.is_closed:
        return _hass_client
    async with _hass_lock:
        if _hass_client is None or _hass_client.is_closed:
            _hass_client = httpx.AsyncClient(
                base_url=HASS_API_BASE,
                timeout=httpx.Timeout(15.0),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
    return _hass_client


async def _get_states_map() -> Dict[str, Dict[str, Any]]:
    try:
        client = await _hass()
        response = await client.get("/states", headers=_hass_headers())
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("Failed to read HA states (status %s).", exc.response.status_code)
        raise HTTPException(status_code=502, detail="Failed to read Home Assistant states.") from exc
    except httpx.HTTPError as exc:
        logger.warning("Failed to read HA states: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to read Home Assistant states.") from exc
    except (ValueError, TypeError) as exc:
        logger.warning("Invalid HA states payload: %s", exc)
        raise HTTPException(status_code=502, detail="Invalid Home Assistant states payload.") from exc
    return {item["entity_id"]: item for item in payload}


def _coerce_float(value: Optional[str]) -> float:
    if value is None:
        return 0.0
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def _safe_float(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if normalized in _UNAVAILABLE_STATES:
        return None
    try:
        result = float(str(value).replace(",", "."))
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def _coerce_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        result = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized in {"1", "true", "on", "yes"}
    return bool(value)


def _build_lighting_engine(state_map: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    lighting_def = MAPPING.get("lighting_spectrum", {})
    current = {}
    for target in lighting_def.get("targets", []):
        role = target.get("role")
        eid = target.get("entity_id")
        if role and eid:
            current[role] = _coerce_float(state_map.get(eid, {}).get("state"))

    autopilot_eid = next((i["entity_id"] for i in lighting_def.get("inputs", []) if i.get("role") == "autopilot"), None)
    autopilot_state = state_map.get(autopilot_eid, {}).get("state", "off") if autopilot_eid else "off"

    return {
        "current_spectrum": current,
        "autopilot": autopilot_state == "on",
    }


def _check_sensor_health(state_map: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    issues: List[str] = []
    for category, definition in MAPPING.items():
        for section_name in ("inputs", "targets"):
            section_data = definition.get(section_name)
            if not isinstance(section_data, list): continue
            for item in section_data:
                entity_id = item.get("entity_id")
                if not entity_id: continue
                state_obj = state_map.get(entity_id)
                if not state_obj:
                    issues.append(f"{entity_id}: missing")
                    continue
                state_val = str(state_obj.get("state") or "").lower()
                if state_val in _UNAVAILABLE_STATES:
                    issues.append(f"{entity_id}: {state_val}")

    alarm_entities: List[str] = []
    system_alerts = MAPPING.get("system_alerts", {})
    if isinstance(system_alerts, dict):
        for target in system_alerts.get("targets", []):
            eid = target.get("entity_id")
            if eid:
                alarm_entities.append(eid)

    if not alarm_entities:
        global _warned_missing_alerts
        if not _warned_missing_alerts:
            logger.warning("system_alerts.targets missing from mapping.json; alarms disabled.")
            _warned_missing_alerts = True

    alarms_active: List[str] = []
    for eid in alarm_entities:
        state_obj = state_map.get(eid)
        if state_obj:
            state_val = str(state_obj.get("state") or "").lower()
            if state_val in ("on", "true", "detected"):
                alarms_active.append(eid)

    failsafe = len(issues) > 3 or len(alarms_active) > 0
    return {
        "healthy": len(issues) == 0 and len(alarms_active) == 0,
        "failsafe": failsafe,
        "sensor_issues": issues[:10],
        "alarms_active": alarms_active,
    }


async def _notify_failsafe(health: Dict[str, Any]):
    global _last_notify_time
    if not health.get("failsafe"):
        return
    async with _notify_lock:
        now = time.time()
        if now - _last_notify_time < 3600:
            return  # Rate limit: 1 hour
        _last_notify_time = now
    message = "GrowMind AI detected critical system issues: " + ", ".join(health["alarms_active"] + health["sensor_issues"][:3])
    try:
        await _invoke_service("persistent_notification", "create", {
            "title": "GrowMind AI Alert",
            "message": message,
            "notification_id": "growmind_failsafe"
        })
    except Exception:
        logger.exception("Failed to send HA notification")


async def _build_dashboard_payload(state_map: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    health = _check_sensor_health(state_map)
    if health["failsafe"]:
        asyncio.create_task(_notify_failsafe(health))

    return {
        "lighting_engine": _build_lighting_engine(state_map),
        "system_health": health,
    }


def _build_service_call(input_meta: Dict[str, Any], value: Any) -> Optional[Dict[str, Any]]:
    entity_id = input_meta["entity_id"]
    input_type = input_meta.get("type")

    if input_type == "input_number":
        numeric = _coerce_number(value)
        if numeric is None:
            raise HTTPException(status_code=400, detail=f"Invalid numeric value for '{entity_id}'")
        return {
            "domain": "input_number",
            "service": "set_value",
            "payload": {"entity_id": entity_id, "value": numeric}
        }
    if input_type == "input_select":
        if value is None:
            raise HTTPException(status_code=400, detail=f"Invalid selection for '{entity_id}'")
        return {
            "domain": "input_select",
            "service": "select_option",
            "payload": {"entity_id": entity_id, "option": str(value)}
        }
    if input_type == "input_boolean":
        service = "turn_on" if _coerce_bool(value) else "turn_off"
        return {
            "domain": "input_boolean",
            "service": service,
            "payload": {"entity_id": entity_id}
        }
    if input_type == "input_datetime":
        payload: Dict[str, Any] = {"entity_id": entity_id}
        if isinstance(value, dict):
            payload.update({k: v for k, v in value.items() if k in {"date", "time"}})
        elif isinstance(value, str):
            if "T" in value:
                date_part, time_part = value.split("T", 1)
                payload["date"] = date_part
                payload["time"] = time_part[:8]
            else:
                if ":" in value:
                    payload["time"] = value
                else:
                    payload["date"] = value
        return {
            "domain": "input_datetime",
            "service": "set_datetime",
            "payload": payload
        }
    return None


async def _invoke_service(domain: str, service: str, payload: Dict[str, Any]) -> None:
    try:
        client = await _hass()
        response = await client.post(
            f"/services/{domain}/{service}",
            headers=_hass_headers(),
            json=payload,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.warning("HA service call failed (%s/%s): %s", domain, service, exc)
        raise HTTPException(status_code=exc.response.status_code, detail="Home Assistant service call failed.") from exc
    except httpx.HTTPError as exc:
        logger.warning("Failed to call HA service (%s/%s): %s", domain, service, exc)
        raise HTTPException(status_code=502, detail="Failed to call Home Assistant service.") from exc


@app.get("/api/ha/state/{entity_id}")
async def read_ha_state(entity_id: str) -> Dict[str, Any]:
    try:
        client = await _hass()
        response = await client.get(f"/states/{entity_id}", headers=_hass_headers())
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("HA state read failed (%s): %s", entity_id, exc)
        raise HTTPException(status_code=exc.response.status_code, detail="Home Assistant state read failed.") from exc
    except httpx.HTTPError as exc:
        logger.warning("Failed to read HA state (%s): %s", entity_id, exc)
        raise HTTPException(status_code=502, detail="Failed to read Home Assistant state.") from exc


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/config")
async def get_configuration() -> Dict[str, Any]:
    state_map = await _get_states_map()
    response: Dict[str, Any] = {}
    for category, definition in MAPPING.items():
        if not isinstance(definition, dict): continue
        category_payload: Dict[str, Any] = {
            "label": definition.get("label", category.title()),
            "inputs": [],
            "targets": []
        }

        for input_meta in definition.get("inputs", []):
            entity_id = input_meta.get("entity_id")
            if entity_id:
                state = state_map.get(entity_id, {}).get("state")
                category_payload["inputs"].append({**input_meta, "value": state})

        for target_meta in definition.get("targets", []):
            entity_id = target_meta.get("entity_id")
            if entity_id:
                state = state_map.get(entity_id, {}).get("state")
                category_payload["targets"].append({**target_meta, "value": state, "read_only": True})

        response[category] = category_payload

    return response


@app.get("/api/dashboard")
async def get_dashboard() -> Dict[str, Any]:
    state_map = await _get_states_map()
    return await _build_dashboard_payload(state_map)


@app.post("/api/config/update")
async def update_configuration(payload: UpdatePayload):
    input_meta = _find_input(payload.category, payload.role)
    service_call = _build_service_call(input_meta, payload.value)
    if not service_call:
        raise HTTPException(status_code=400, detail=f"Unsupported entity type for role '{payload.role}'")

    await _invoke_service(
        domain=service_call["domain"],
        service=service_call["service"],
        payload=service_call["payload"]
    )

    return {"status": "ok"}


def _find_input(category: str, role: str) -> Dict[str, Any]:
    category_def = MAPPING.get(category)
    if not category_def:
        raise HTTPException(status_code=404, detail=f"Unknown category '{category}'")
    for item in category_def.get("inputs", []):
        if item.get("role") == role:
            return item
    raise HTTPException(status_code=404, detail=f"Role '{role}' not found in category '{category}'")


@app.websocket("/ws/lighting")
async def lighting_websocket(websocket: WebSocket):
    await websocket.accept()
    previous_payload: Optional[Dict[str, Any]] = None
    delay = 5.0
    consecutive_errors = 0
    try:
        while True:
            try:
                state_map = await _get_states_map()
                payload = await _build_dashboard_payload(state_map)
                if payload != previous_payload:
                    await websocket.send_json(payload)
                    previous_payload = payload
                delay = 5.0
                consecutive_errors = 0
            except HTTPException as exc:
                consecutive_errors += 1
                logger.warning("WS lighting: HA request failed (%s), attempt %d", exc.detail, consecutive_errors)
                delay = min(delay * 1.5, 60.0)
            except WebSocketDisconnect:
                break
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                consecutive_errors += 1
                logger.exception("WS lighting: unexpected error, attempt %d: %s", consecutive_errors, exc)
                delay = min(delay * 2.0, 60.0)
            if consecutive_errors >= WS_MAX_ERRORS:
                logger.error("WS lighting: too many consecutive errors, closing connection.")
                break
            await asyncio.sleep(delay)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.exception("WS lighting: fatal error: %s", exc)
    finally:
        if websocket.client_state != WebSocketState.DISCONNECTED:
            try:
                await websocket.close()
            except Exception:
                pass


# --- Static mount ---
_static_dir = Path(__file__).resolve().parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
