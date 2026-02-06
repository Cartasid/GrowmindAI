"""Secure logging with credential redaction."""
import json
import logging
import os
import re
import time
from typing import List


class SecureLoggingFilter(logging.Filter):
    """Redacts all sensitive credentials from log records."""

    # Patterns for different credential types
    PATTERNS = {
        'bearer': re.compile(r'Bearer\s+[A-Za-z0-9_.-]+'),
        'api_key': re.compile(r'(?:api[_-]?key|apikey)["\']?\s*[:=]\s*["\']?[^\s"\'\\]+', re.IGNORECASE),
        'auth': re.compile(r'[Aa]uthorization["\']?\s*[:=]\s*["\']?[^\s"\'\\]+'),
        'token': re.compile(r'[Tt]oken["\']?\s*[:=]\s*["\']?[^\s"\'\\]+'),
        'password': re.compile(r'[Pp]assword["\']?\s*[:=]\s*["\']?[^\s"\'\\]+'),
        'secret': re.compile(r'[Ss]ecret["\']?\s*[:=]\s*["\']?[^\s"\'\\]+'),
        'gemini': re.compile(r'gemini[_-]?api[_-]?key["\']?\s*[:=]\s*["\']?[^\s"\'\\]+', re.IGNORECASE),
    }

    def filter(self, record: logging.LogRecord) -> bool:
        """Filter and redact sensitive information."""
        try:
            # Redact message
            message = record.getMessage()
            redacted = self._redact(message)

            if redacted != message:
                record.msg = redacted
                record.args = ()

            # Redact exception info
            if record.exc_text:
                record.exc_text = self._redact(record.exc_text)

        except Exception:
            # Never let logging crash the app
            pass

        return True

    @staticmethod
    def _redact(text: str) -> str:
        """Apply all redaction patterns."""
        redacted = text
        for pattern in SecureLoggingFilter.PATTERNS.values():
            redacted = pattern.sub('[REDACTED]', redacted)
        return redacted


def setup_secure_logging() -> None:
    """Configure all loggers with secure filter."""
    secure_filter = SecureLoggingFilter()

    # Apply to root logger
    root_logger = logging.getLogger()
    
    # Remove duplicate filters to avoid duplicates
    for existing_filter in root_logger.filters:
        if isinstance(existing_filter, SecureLoggingFilter):
            root_logger.removeFilter(existing_filter)
    
    root_logger.addFilter(secure_filter)

    # Apply to all existing handlers
    for handler in root_logger.handlers:
        # Remove duplicate filters
        for existing_filter in handler.filters:
            if isinstance(existing_filter, SecureLoggingFilter):
                handler.removeFilter(existing_filter)
        handler.addFilter(secure_filter)


class JsonFormatter(logging.Formatter):
    """Format logs as JSON for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


def setup_log_format() -> None:
    """Apply JSON formatting when LOG_FORMAT=json is set."""
    if os.getenv("LOG_FORMAT", "").lower() != "json":
        return
    formatter = JsonFormatter()
    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        handler.setFormatter(formatter)
