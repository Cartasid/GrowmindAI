from pathlib import Path
import json
import os
from typing import Any, Dict

def resolve_mapping_path() -> Path:
    """Resolve the path to mapping.json consistently."""
    # Try project root (relative to this file: ../../mapping.json)
    root_path = Path(__file__).resolve().parents[2] / "mapping.json"
    if root_path.exists():
        return root_path

    # Try current directory (e.g. if running from backend)
    local_path = Path(__file__).resolve().parent / "mapping.json"
    if local_path.exists():
        return local_path

    # Try parent directory
    parent_path = Path(__file__).resolve().parents[1] / "mapping.json"
    if parent_path.exists():
        return parent_path

    raise RuntimeError("mapping.json not found")

def load_mapping() -> Dict[str, Any]:
    path = resolve_mapping_path()
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)
