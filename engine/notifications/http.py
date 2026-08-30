"""Small, injectable JSON HTTP boundary for notification providers.

The engine deliberately uses the standard library here: notifications must stay optional and
must not pull a provider SDK or a test-only HTTP client into the runtime dependency graph.
"""

from __future__ import annotations

import json
import socket
from dataclasses import dataclass
from typing import Mapping, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class JsonResponse:
    """A JSON HTTP response with no provider-specific exception details."""

    status_code: int
    payload: Mapping[str, object]


class JsonPoster(Protocol):
    """A narrow seam that makes provider serialization testable without a network."""

    def post_json(
        self,
        url: str,
        *,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> JsonResponse: ...


class ProviderRequestError(RuntimeError):
    """Safe error metadata; ``uncertain`` means the provider may have accepted the request."""

    def __init__(self, error_code: str, *, uncertain: bool = False) -> None:
        super().__init__(error_code)
        self.error_code = error_code
        self.uncertain = uncertain


def _json_payload(raw: bytes) -> Mapping[str, object]:
    if not raw:
        return {}
    try:
        decoded = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


class UrllibJsonPoster:
    """Production transport. Network failures are deliberately treated as ambiguous."""

    def post_json(
        self,
        url: str,
        *,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> JsonResponse:
        request_headers = {"Content-Type": "application/json", **dict(headers)}
        request = Request(
            url,
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers=request_headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                return JsonResponse(
                    status_code=response.status,
                    payload=_json_payload(response.read()),
                )
        except HTTPError as exc:
            return JsonResponse(
                status_code=exc.code,
                payload=_json_payload(exc.read()),
            )
        except (TimeoutError, socket.timeout, URLError) as exc:
            # A timeout after writing bytes is indistinguishable from an accepted request.
            raise ProviderRequestError("network_or_timeout", uncertain=True) from exc
