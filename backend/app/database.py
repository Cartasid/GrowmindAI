"""Unified SQLite database for GrowMind AI storage."""
from __future__ import annotations

import contextlib
import json
import logging
import os
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = "/data/growmind.db"
FALLBACK_DB_PATH = "/tmp/growmind.db"


class InvalidIdentifierError(ValueError):
    """Raised when a collection/key identifier is invalid."""


_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9_.:-]+$")
_MAX_IDENTIFIER_LENGTH = 128


def _validate_identifier(value: str, label: str, *, max_length: int = _MAX_IDENTIFIER_LENGTH) -> str:
    if not isinstance(value, str):
        raise InvalidIdentifierError(f"Invalid {label}: expected string")
    cleaned = value.strip()
    if not cleaned:
        raise InvalidIdentifierError(f"Invalid {label}: empty value")
    if len(cleaned) > max_length:
        raise InvalidIdentifierError(f"Invalid {label}: exceeds {max_length} characters")
    if not _IDENTIFIER_RE.match(cleaned):
        raise InvalidIdentifierError(
            f"Invalid {label}: only letters, numbers, '.', '_', '-', ':' allowed"
        )
    return cleaned


def _resolve_db_path() -> Path:
    override = os.getenv("DATABASE_URL")
    if override:
        return Path(override)

    primary = Path(DEFAULT_DB_PATH)
    try:
        primary.parent.mkdir(parents=True, exist_ok=True)
        # Test write access
        test_file = primary.parent / ".test_write"
        test_file.touch()
        test_file.unlink()
        return primary
    except (OSError, IOError):
        fallback = Path(FALLBACK_DB_PATH)
        fallback.parent.mkdir(parents=True, exist_ok=True)
        logger.warning(
            "Cannot write to %s – falling back to %s (data will not survive container restart)",
            primary, fallback
        )
        return fallback


class GrowMindDB:
    _instance: Optional[GrowMindDB] = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(GrowMindDB, cls).__new__(cls)
                cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.path = _resolve_db_path()
        self._init_db()
        self._initialized = True

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @contextlib.contextmanager
    def transaction(self) -> Generator[sqlite3.Connection, None, None]:
        """Context manager for database transactions with automatic rollback on error."""
        conn = self._get_connection()
        try:
            # Start transaction with exclusive lock
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Transaction failed, rolled back: {e}")
            raise
        finally:
            conn.close()

    def _init_db(self):
        with self._get_connection() as conn:
            # Inventory table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS inventory (
                    component TEXT PRIMARY KEY,
                    grams REAL NOT NULL DEFAULT 0.0,
                    initial_grams REAL NOT NULL DEFAULT 0.0,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Key-Value Collections table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS collections (
                    category TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (category, key)
                )
            """)

            # App Settings table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()

    # --- Collection Methods ---

    def get_collection(self, category: str) -> Dict[str, Any]:
        """Retrieve an entire collection by category."""
        category = _validate_identifier(category, "category")
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT key, value FROM collections WHERE category = ?", (category,)
            )
            return {row["key"]: json.loads(row["value"]) for row in cursor.fetchall()}

    def set_collection(self, category: str, data: Dict[str, Any]) -> None:
        """Replace entire collection with new data."""
        category = _validate_identifier(category, "category")
        cleaned: Dict[str, Any] = {}
        for key, value in (data or {}).items():
            cleaned[_validate_identifier(key, "key")] = value
        with self._get_connection() as conn:
            if not cleaned:
                conn.execute("DELETE FROM collections WHERE category = ?", (category,))
            else:
                # Delete keys that are no longer present
                placeholders = ", ".join("?" for _ in cleaned)
                conn.execute(
                    f"DELETE FROM collections WHERE category = ? AND key NOT IN ({placeholders})",
                    (category, *cleaned.keys())
                )
                # Upsert new/updated values
                for key, val in cleaned.items():
                    conn.execute(
                        """
                        INSERT INTO collections (category, key, value, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(category, key) DO UPDATE SET
                        value = excluded.value,
                        updated_at = CURRENT_TIMESTAMP
                        """,
                        (category, key, json.dumps(val))
                    )
            conn.commit()

    def get_collection_key(self, category: str, key: str, default: Any = None) -> Any:
        """Retrieve a specific key from a collection with type safety."""
        category = _validate_identifier(category, "category")
        key = _validate_identifier(key, "key")
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT value FROM collections WHERE category = ? AND key = ?",
                (category, key)
            )
            row = cursor.fetchone()
            return json.loads(row["value"]) if row else default

    def set_collection_key(self, category: str, key: str, value: Any) -> None:
        """Store a key-value pair with automatic JSON serialization."""
        category = _validate_identifier(category, "category")
        key = _validate_identifier(key, "key")
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO collections (category, key, value, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(category, key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
                """,
                (category, key, json.dumps(value))
            )
            conn.commit()

    def delete_collection_key(self, category: str, key: str) -> None:
        """Delete a specific key from a collection."""
        category = _validate_identifier(category, "category")
        key = _validate_identifier(key, "key")
        with self._get_connection() as conn:
            conn.execute(
                "DELETE FROM collections WHERE category = ? AND key = ?",
                (category, key)
            )
            conn.commit()

    # --- Inventory Methods ---

    def fetch_inventory(self) -> Dict[str, Dict[str, float]]:
        """Retrieve all inventory items with their quantities."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT component, grams, initial_grams FROM inventory")
            return {
                row["component"]: {
                    "grams": float(row["grams"]),
                    "initial_grams": float(row["initial_grams"])
                } for row in cursor.fetchall()
            }

    def update_inventory(self, component: str, grams: float, initial_grams: Optional[float] = None) -> None:
        """Update or create an inventory item."""
        with self._get_connection() as conn:
            if initial_grams is not None:
                conn.execute(
                    """
                    INSERT INTO inventory (component, grams, initial_grams, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(component) DO UPDATE SET
                    grams = excluded.grams,
                    initial_grams = excluded.initial_grams,
                    updated_at = CURRENT_TIMESTAMP
                    """,
                    (component, grams, initial_grams)
                )
            else:
                conn.execute(
                    """
                    INSERT INTO inventory (component, grams, initial_grams, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(component) DO UPDATE SET
                    grams = excluded.grams,
                    updated_at = CURRENT_TIMESTAMP
                    """,
                    (component, grams, grams)
                )
            conn.commit()

    def ensure_inventory_items(self, items: Dict[str, float]):
        """Ensure these components exist in the inventory table with at least these initial values."""
        with self._get_connection() as conn:
            for component, full_size in items.items():
                conn.execute(
                    """
                    INSERT OR IGNORE INTO inventory (component, grams, initial_grams)
                    VALUES (?, ?, ?)
                    """,
                    (component, full_size, full_size)
                )
            conn.commit()

    # --- Settings Methods ---

    def get_setting(self, key: str, default: Any = None) -> Any:
        """Retrieve a setting by key with optional default."""
        key = _validate_identifier(key, "setting key")
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT value FROM settings WHERE key = ?", (key,))
            row = cursor.fetchone()
            return json.loads(row["value"]) if row else default

    def set_setting(self, key: str, value: Any) -> None:
        """Store or update a setting."""
        key = _validate_identifier(key, "setting key")
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
                """,
                (key, json.dumps(value))
            )
            conn.commit()


# Global instance
db = GrowMindDB()
