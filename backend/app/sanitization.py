"""Input sanitization and validation utilities."""
import html
import re
from typing import Any, Dict, List


class InputSanitizer:
    """Sanitize and validate user input."""

    MAX_TEXT_LENGTH = 10000
    MAX_ARRAY_LENGTH = 1000
    MAX_IDENTIFIER_LENGTH = 128

    DANGEROUS_PATTERNS = [
        r'ignore.*instructions',
        r'forget.*previous',
        r'system.*prompt',
        r'jailbreak',
        r'override\s+rules',
        r'bypass',
    ]

    @staticmethod
    def sanitize_text(text: str, max_length: int = MAX_TEXT_LENGTH) -> str:
        """Remove dangerous characters from text."""
        if not isinstance(text, str):
            raise ValueError("Input must be string")

        text = text.strip()

        if len(text) > max_length:
            raise ValueError(f"Text too long (max {max_length} characters)")

        if not text:
            raise ValueError("Input cannot be empty")

        # HTML escape
        text = html.escape(text)

        # Remove control characters (except newline, carriage return, tab)
        text = ''.join(c for c in text if ord(c) >= 32 or c in '\n\r\t')

        return text

    @staticmethod
    def sanitize_prompt(prompt: str) -> str:
        """Sanitize user prompt for LLM."""
        text = InputSanitizer.sanitize_text(prompt)

        # Check for potentially dangerous patterns
        for pattern in InputSanitizer.DANGEROUS_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                raise ValueError("Input contains potentially harmful content")

        return text

    @staticmethod
    def sanitize_identifier(identifier: str) -> str:
        """Sanitize identifier (grow_id, plan_id, etc)."""
        if not isinstance(identifier, str):
            raise ValueError("Identifier must be string")

        identifier = identifier.strip()

        if not identifier:
            raise ValueError("Identifier cannot be empty")

        if len(identifier) > 128:
            raise ValueError(f"Identifier too long (max 128 characters)")

        # Only allow alphanumeric, dash, underscore, dot, colon
        if not re.match(r'^[A-Za-z0-9_\-.:]+$', identifier):
            raise ValueError(
                "Identifier contains invalid characters (only alphanumeric, -, _, ., : allowed)"
            )

        return identifier

    @staticmethod
    def sanitize_json(data: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively sanitize JSON data."""
        if not isinstance(data, dict):
            raise ValueError("Input must be dict")

        sanitized = {}

        for key, value in data.items():
            # Validate key
            if not isinstance(key, str) or len(key) > 100:
                continue

            if isinstance(value, str):
                try:
                    sanitized[key] = InputSanitizer.sanitize_text(value)
                except ValueError:
                    # Skip invalid strings
                    continue
            elif isinstance(value, dict):
                sanitized[key] = InputSanitizer.sanitize_json(value)
            elif isinstance(value, (int, float, bool, type(None))):
                sanitized[key] = value
            elif isinstance(value, list):
                if len(value) > InputSanitizer.MAX_ARRAY_LENGTH:
                    continue
                sanitized[key] = [
                    InputSanitizer.sanitize_text(v) if isinstance(v, str) else v
                    for v in value
                    if not isinstance(v, str) or v.strip()
                ]

        return sanitized

    @staticmethod
    def validate_numeric_range(value: float, min_val: float = None, max_val: float = None) -> float:
        """Validate numeric value is within range."""
        if not isinstance(value, (int, float)):
            raise ValueError(f"Expected numeric value, got {type(value)}")

        if min_val is not None and value < min_val:
            raise ValueError(f"Value {value} is below minimum {min_val}")

        if max_val is not None and value > max_val:
            raise ValueError(f"Value {value} exceeds maximum {max_val}")

        return float(value)
