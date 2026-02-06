"""Background telemetry collection and opt-in management."""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

from .storage import get_collection, set_collection

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(minimum, value)


TELEMETRY_COLLECTION = "telemetry"
TELEMETRY_SETTINGS_KEY = "settings"
DEFAULT_ENDPOINT = os.getenv("TELEMETRY_API_URL", "https://api.growmind.cloud/telemetry")
DEFAULT_GROW_ID = os.getenv("TELEMETRY_GROW_ID", "default")
WINDOW_HOURS = _env_int("TELEMETRY_WINDOW_HOURS", 24)
INTERVAL_HOURS = _env_int("TELEMETRY_INTERVAL_HOURS", 24)
SENSOR_KEYS = ("vpd", "ec", "vwc")
JOURNAL_COLLECTION = "photonfluxJournal"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None


def _ensure_settings(raw: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    base = raw or {}
    return {
        "enabled": bool(base.get("enabled", False)),
        "lastSent": base.get("lastSent"),
        "endpoint": base.get("endpoint") or DEFAULT_ENDPOINT,
        "windowHours": base.get("windowHours", WINDOW_HOURS),
    }


def _load_settings_store() -> Dict[str, Any]:
    collection = get_collection(TELEMETRY_COLLECTION)
    return collection.get(TELEMETRY_SETTINGS_KEY, {})


def get_settings() -> Dict[str, Any]:
    return _ensure_settings(_load_settings_store())


def _save_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    collection = get_collection(TELEMETRY_COLLECTION)
    collection[TELEMETRY_SETTINGS_KEY] = settings
    set_collection(TELEMETRY_COLLECTION, collection)
    return settings


def set_enabled(enabled: bool) -> Dict[str, Any]:
    current = get_settings()
    current.update({"enabled": bool(enabled), "updatedAt": _now().isoformat()})
    return _save_settings(current)


def record_last_sent(timestamp: datetime) -> Dict[str, Any]:
    current = get_settings()
    current["lastSent"] = timestamp.isoformat()
    return _save_settings(current)


def _journal_key(grow_id: str) -> str:
    return f"journal_{grow_id}"


def _load_recent_journal_entries(grow_id: str, window: timedelta) -> List[Dict[str, Any]]:
    store = get_collection(JOURNAL_COLLECTION)
    entries: List[Dict[str, Any]] = store.get(_journal_key(grow_id), [])
    if not entries:
        return []
    cutoff = _now() - window
    recent: List[Dict[str, Any]] = []
    for entry in entries:
        raw_date = entry.get("date")
        parsed_date = _parse_iso(raw_date)
        if not parsed_date or parsed_date < cutoff:
            continue
        entry_copy = dict(entry)
        entry_copy["_parsed_date"] = parsed_date
        recent.append(entry_copy)
    return recent


def _average(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return round(sum(values) / len(values), 3)


def collect_daily_summary(grow_id: str = DEFAULT_GROW_ID) -> Optional[Dict[str, Any]]:
    window = timedelta(hours=WINDOW_HOURS)
    entries = _load_recent_journal_entries(grow_id, window)
    if not entries:
        return None
    metrics_bucket: Dict[str, List[float]] = {key: [] for key in SENSOR_KEYS}
    latest_phase: Optional[str] = None
    latest_timestamp: Optional[datetime] = None
    for entry in entries:
        parsed_date: datetime = entry["_parsed_date"]
        if not latest_timestamp or parsed_date > latest_timestamp:
            latest_timestamp = parsed_date
            latest_phase = entry.get("phase")
        metrics = entry.get("metrics") or {}
        for key in SENSOR_KEYS:
            value = metrics.get(key)
            if isinstance(value, (int, float)):
                metrics_bucket[key].append(float(value))
    averages: Dict[str, float] = {}
    for key, values in metrics_bucket.items():
        avg = _average(values)
        if avg is not None:
            averages[key] = avg
    if not averages:
        return None
    return {
        "timestamp": _now().isoformat(),
        "growId": grow_id,
        "phase": latest_phase,
        "metrics": averages,
        "sampleCount": max((len(v) for v in metrics_bucket.values() if v), default=0),
        "windowHours": WINDOW_HOURS,
    }


async def send_daily_payload(force: bool = False) -> bool:
    settings = get_settings()
    if not settings.get("enabled") and not force:
        return False
    last_sent = _parse_iso(settings.get("lastSent"))
    if not force and last_sent is not None:
        if _now() - last_sent < timedelta(hours=INTERVAL_HOURS):
            return False
    payload = collect_daily_summary()
    if not payload:
        logger.info("telemetry: no recent samples available, skipping send")
        return False
    endpoint = settings.get("endpoint") or DEFAULT_ENDPOINT
    if not endpoint:
        logger.warning("telemetry: endpoint missing, skipping send")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(endpoint, json=payload)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.exception("telemetry: failed to send payload: %s", exc)
        return False
    record_last_sent(_now())
    logger.info("telemetry: payload sent to %s", endpoint)
    return True


async def telemetry_worker(stop_event: Optional[asyncio.Event] = None) -> None:
    stopper = stop_event or asyncio.Event()
    while not stopper.is_set():
        try:
            await send_daily_payload()
        except Exception as exc:
            logger.exception("telemetry: unexpected error in worker: %s", exc)

        # Calculate dynamic delay
        settings = get_settings()
        if not settings.get("enabled"):
            delay = 3600  # Check once per hour if user opted in
        else:
            last_sent = _parse_iso(settings.get("lastSent"))
            if last_sent:
                elapsed = (_now() - last_sent).total_seconds()
                remaining = (INTERVAL_HOURS * 3600) - elapsed
                if remaining > 0:
                    delay = remaining
                else:
                    # Should have sent but failed (error or no data)
                    delay = 600  # Retry in 10 minutes
            else:
                delay = 60  # Try soon if never sent

        # Clamp delay to sane bounds
        delay = max(10, min(delay, INTERVAL_HOURS * 3600))

        try:
            await asyncio.wait_for(stopper.wait(), timeout=delay)
        except asyncio.TimeoutError:
            continue


async def shutdown_worker(task: Optional[asyncio.Task[Any]]) -> None:
    if not task:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
