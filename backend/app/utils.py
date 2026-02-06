from pathlib import Path
import json
import logging
import os
from typing import Any, Dict

logger = logging.getLogger(__name__)

# Define mapping path relative to this file
MAPPING_FILE_NAME = "mapping.json"
# Primary path: project root (../../mapping.json from this file)
MAPPING_PRIMARY_PATH = Path(__file__).resolve().parents[2] / MAPPING_FILE_NAME


def resolve_mapping_path() -> Path:
    """Resolve the path to mapping.json with clear priority order.
    
    Priority:
    1. Environment variable MAPPING_PATH if set
    2. Project root (../../mapping.json)
    3. Config directory (fallback)
    
    Raises RuntimeError if not found with detailed error message.
    """
    # Check environment variable first
    env_path = os.getenv("MAPPING_PATH")
    if env_path:
        path = Path(env_path)
        if path.exists() and path.is_file():
            logger.info("Using mapping.json from MAPPING_PATH: %s", path)
            return path
        else:
            logger.error("MAPPING_PATH points to non-existent file: %s", path)
            raise RuntimeError(f"MAPPING_PATH configured but file not found: {path}")
    
    # Try project root (primary location)
    if MAPPING_PRIMARY_PATH.exists() and MAPPING_PRIMARY_PATH.is_file():
        logger.info("Using mapping.json from project root: %s", MAPPING_PRIMARY_PATH)
        return MAPPING_PRIMARY_PATH
    
    # Try fallback locations for compatibility
    fallback_paths = [
        Path(__file__).resolve().parent / MAPPING_FILE_NAME,  # app directory
        Path(__file__).resolve().parents[1] / MAPPING_FILE_NAME,  # backend directory
        Path.cwd() / MAPPING_FILE_NAME,  # current working directory
    ]
    
    for path in fallback_paths:
        if path.exists() and path.is_file():
            logger.warning(
                "mapping.json found in non-standard location: %s. "
                "Recommend placing at project root: %s",
                path, MAPPING_PRIMARY_PATH
            )
            return path
    
    # Not found - provide detailed error
    searched_paths = [MAPPING_PRIMARY_PATH] + fallback_paths
    error_msg = (
        f"mapping.json not found. Searched paths (in order):\n"
        + "\n".join(f"  - {p}" for p in searched_paths)
        + f"\nSet MAPPING_PATH environment variable to override."
    )
    logger.error(error_msg)
    raise RuntimeError(error_msg)


def load_mapping() -> Dict[str, Any]:
    """Load mapping.json from disk with error handling.
    
    Returns:
        Dict with mapping configuration
        
    Raises:
        RuntimeError: If file not found or invalid JSON
    """
    try:
        path = resolve_mapping_path()
        with path.open("r", encoding="utf-8") as f:
            mapping = json.load(f)
        
        # Validate structure
        if not isinstance(mapping, dict):
            raise ValueError(f"Invalid mapping.json: root must be object, got {type(mapping).__name__}")
        
        logger.info("Successfully loaded mapping.json from %s with %d keys", path, len(mapping))
        return mapping
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON in mapping.json: {e}") from e
    except Exception as e:
        raise RuntimeError(f"Failed to load mapping.json: {e}") from e

