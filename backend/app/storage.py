"""Persistent JSON store shared between backend features."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict

import portalocker

logger = logging.getLogger(__name__)

DEFAULT_DATA_FILE = "/share/growmind/persist.json"
FALLBACK_DATA_FILE = "/tmp/growmind/persist.json"
LOCK_TIMEOUT = 10.0

_resolved_path: Path | None = None


def _data_file() -> Path:
    global _resolved_path
    if _resolved_path is not None:
        return _resolved_path

    override = os.getenv("DATA_FILE")
    if override:
        _resolved_path = Path(override)
        return _resolved_path

    primary = Path(DEFAULT_DATA_FILE)
    try:
        primary.parent.mkdir(parents=True, exist_ok=True)
        _resolved_path = primary
    except OSError:
        fallback = Path(FALLBACK_DATA_FILE)
        fallback.parent.mkdir(parents=True, exist_ok=True)
        logger.warning(
            "Cannot write to %s – falling back to %s (data will not survive container restart)",
            primary.parent, fallback,
        )
        _resolved_path = fallback
    return _resolved_path


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _lock_path(path: Path) -> Path:
    return path.with_suffix(path.suffix + ".lock")


def _acquire_lock(path: Path):  # type: ignore[return-type]
    return portalocker.Lock(str(_lock_path(path)), timeout=LOCK_TIMEOUT)


def _write_json(path: Path, payload: Dict[str, Dict[str, Any]]) -> None:
    temp_path = path.with_name(path.name + ".tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.flush()
        os.fsync(handle.fileno())
    temp_path.replace(path)


def load_store() -> Dict[str, Dict[str, Any]]:
    path = _data_file()
    _ensure_parent(path)
    with _acquire_lock(path):
        try:
            with path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except FileNotFoundError:
            return {}
        except json.JSONDecodeError:
            logger.warning("Invalid JSON in %s. Resetting store.", path)
            return {}


def save_store(data: Dict[str, Dict[str, Any]]) -> None:
    path = _data_file()
    _ensure_parent(path)
    with _acquire_lock(path):
        _write_json(path, data)


def get_collection(collection: str) -> Dict[str, Any]:
    store = load_store()
    return dict(store.get(collection) or {})


def set_collection(collection: str, payload: Dict[str, Any]) -> None:
    path = _data_file()
    _ensure_parent(path)
    with _acquire_lock(path):
        try:
            with path.open("r", encoding="utf-8") as handle:
                store = json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            store = {}
        store[collection] = payload
        _write_json(path, store)


def set_collection_key(collection: str, key: str, value: Any) -> None:
    path = _data_file()
    _ensure_parent(path)
    with _acquire_lock(path):
        try:
            with path.open("r", encoding="utf-8") as handle:
                store = json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            store = {}
        store.setdefault(collection, {})[key] = value
        _write_json(path, store)


def delete_collection_key(collection: str, key: str) -> None:
    path = _data_file()
    _ensure_parent(path)
    with _acquire_lock(path):
        try:
            with path.open("r", encoding="utf-8") as handle:
                store = json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            store = {}
        if collection not in store:
            return
        inner = store[collection]
        if key in inner:
            del inner[key]
            _write_json(path, store)
