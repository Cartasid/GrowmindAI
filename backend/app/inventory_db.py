"""SQLite-backed persistence for fertilizer inventory."""

from __future__ import annotations

import logging
import os
import sqlite3
import threading
from pathlib import Path
from typing import Dict

logger = logging.getLogger(__name__)

COMPONENT_KEYS = ("A", "B", "C", "BURST")
_PRIMARY_DB = "/share/growmind/inventory.db"
_FALLBACK_DB = "/tmp/growmind/inventory.db"


def _resolve_db_path() -> Path:
    override = os.getenv("INVENTORY_DB")
    if override:
        return Path(override)
    primary = Path(_PRIMARY_DB)
    try:
        primary.parent.mkdir(parents=True, exist_ok=True)
        return primary
    except OSError:
        fallback = Path(_FALLBACK_DB)
        fallback.parent.mkdir(parents=True, exist_ok=True)
        logger.warning(
            "Cannot write to %s – falling back to %s (data will not survive container restart)",
            primary.parent, fallback,
        )
        return fallback


DEFAULT_DB_PATH = _resolve_db_path()


class InventoryError(RuntimeError):
    """Base error for inventory persistence issues."""


class InsufficientInventoryError(InventoryError):
    """Raised when attempting to consume more grams than available."""


_INIT_LOCK = threading.Lock()
_INITIALIZED = False


def _ensure_parent(path: Path) -> None:
    if path.parent:
        path.parent.mkdir(parents=True, exist_ok=True)


def _default_capacity(component: str) -> float:
    env_key = f"INVENTORY_START_{component}"
    raw = os.getenv(env_key)
    if raw is None:
        return 0.0
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, value)


def initialize() -> None:
    """Ensure the SQLite database and component records exist."""

    global _INITIALIZED
    if _INITIALIZED:
        return
    with _INIT_LOCK:
        if _INITIALIZED:
            return
        _ensure_parent(DEFAULT_DB_PATH)
        with sqlite3.connect(DEFAULT_DB_PATH) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS inventory (
                    component TEXT PRIMARY KEY,
                    grams REAL NOT NULL DEFAULT 0.0,
                    initial_grams REAL NOT NULL DEFAULT 0.0,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            for component in COMPONENT_KEYS:
                cursor = conn.execute(
                    "SELECT component FROM inventory WHERE component = ?", (component,)
                )
                if cursor.fetchone() is None:
                    start_value = _default_capacity(component)
                    conn.execute(
                        """
                        INSERT INTO inventory(component, grams, initial_grams)
                        VALUES (?, ?, ?)
                        """,
                        (component, start_value, start_value),
                    )
        _INITIALIZED = True


def _connect() -> sqlite3.Connection:
    initialize()
    conn = sqlite3.connect(str(DEFAULT_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _read_inventory(conn: sqlite3.Connection) -> Dict[str, Dict[str, float]]:
    cursor = conn.execute(
        "SELECT component, grams, initial_grams FROM inventory ORDER BY component"
    )
    rows = cursor.fetchall()
    return {
        row["component"]: {
            "grams": float(row["grams"]),
            "initial_grams": float(row["initial_grams"]),
        }
        for row in rows
    }


def fetch_inventory() -> Dict[str, Dict[str, float]]:
    """Return the current inventory including capacity per component."""

    with _connect() as conn:
        return _read_inventory(conn)


def apply_consumption(consumption: Dict[str, float]) -> Dict[str, Dict[str, float]]:
    """Subtract the provided consumption dict from inventory, returning new levels."""

    sanitized = {
        key: max(0.0, float(consumption.get(key, 0.0) or 0.0)) for key in COMPONENT_KEYS
    }
    conn = _connect()
    committed = False
    try:
        conn.execute("BEGIN IMMEDIATE")
        current = _read_inventory(conn)
        missing = [component for component in COMPONENT_KEYS if component not in current]
        if missing:
            raise InventoryError(f"Fehlende Lager-Einträge: {', '.join(missing)}")
        for component, used in sanitized.items():
            available = current[component]["grams"]
            if used > available + 1e-6:
                raise InsufficientInventoryError(
                    f"Nicht genug Bestand für {component}: {used:.2f} g angefragt, "
                    f"{available:.2f} g vorhanden."
                )
        for component, used in sanitized.items():
            new_value = max(0.0, current[component]["grams"] - used)
            current[component]["grams"] = new_value
            conn.execute(
                "UPDATE inventory SET grams = ?, updated_at = CURRENT_TIMESTAMP WHERE component = ?",
                (new_value, component),
            )
        conn.commit()
        committed = True
        return current
    finally:
        if not committed:
            conn.rollback()
        conn.close()


def set_stock(component: str, grams: float, *, update_capacity: bool = False) -> None:
    """Utility helper to manually set a component stock (not exposed via API)."""

    if component not in COMPONENT_KEYS:
        raise InventoryError(f"Unbekannte Komponente '{component}'")
    grams = max(0.0, float(grams))
    with _connect() as conn:
        cursor = conn.execute(
            "SELECT component FROM inventory WHERE component = ?", (component,)
        )
        if cursor.fetchone() is None:
            conn.execute(
                "INSERT INTO inventory(component, grams, initial_grams) VALUES (?, ?, ?)",
                (component, grams, grams if update_capacity else 0.0),
            )
        else:
            if update_capacity:
                conn.execute(
                    "UPDATE inventory SET grams = ?, initial_grams = ?, updated_at = CURRENT_TIMESTAMP WHERE component = ?",
                    (grams, grams, component),
                )
            else:
                conn.execute(
                    "UPDATE inventory SET grams = ?, updated_at = CURRENT_TIMESTAMP WHERE component = ?",
                    (grams, component),
                )
