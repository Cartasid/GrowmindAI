"""Storage bridge that redirects JSON-based calls to the SQLite database."""
from __future__ import annotations

from typing import Any, Dict
from .database import db

def get_collection(collection: str) -> Dict[str, Any]:
    return db.get_collection(collection)

def set_collection(collection: str, payload: Dict[str, Any]) -> None:
    db.set_collection(collection, payload)

def set_collection_key(collection: str, key: str, value: Any) -> None:
    db.set_collection_key(collection, key, value)

def delete_collection_key(collection: str, key: str) -> None:
    db.delete_collection_key(collection, key)

# Legacy load/save store are not directly compatible with the new granular DB,
# but we can provide stubs if needed. Most routes use the collection methods.
def load_store() -> Dict[str, Dict[str, Any]]:
    # This is expensive and discouraged with the new DB.
    # Only used by legacy code if at all.
    categories = ["plans", "photonfluxJournal", "telemetry"]
    return {cat: db.get_collection(cat) for cat in categories}

def save_store(data: Dict[str, Dict[str, Any]]) -> None:
    for cat, payload in data.items():
        db.set_collection(cat, payload)
