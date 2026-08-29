"""Shared, bounded OpenAI request configuration for Stream C."""

from __future__ import annotations


DEFAULT_OPENAI_REQUEST_TIMEOUT_SECONDS = 30.0


def validate_request_timeout(timeout_seconds: float) -> float:
    timeout = float(timeout_seconds)
    if timeout <= 0:
        raise ValueError("OpenAI request timeout must be positive")
    return timeout
