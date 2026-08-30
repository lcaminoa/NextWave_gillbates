"""Internal notification records; they are not additions to the shared eight entities."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Mapping


class NotificationChannel(str, Enum):
    email = "email"
    whatsapp = "whatsapp"


class NotificationEvent(str, Enum):
    """The only operator alert emitted in the first release."""

    incident_detected = "incident_detected"


class DeliveryState(str, Enum):
    queued = "queued"
    sending = "sending"
    accepted = "accepted"
    failed = "failed"
    unknown = "unknown"
    skipped = "skipped"


@dataclass(frozen=True)
class ProviderReceipt:
    provider_message_id: str | None


@dataclass(frozen=True)
class OutboundMessage:
    """A rendered, recipient-free message persisted in the local outbox.

    Recipients and credentials stay in process configuration. The message only carries the
    minimum operational facts that are safe to retain locally if the worker restarts.
    """

    dispatch_id: str
    episode_key: str
    incident_id: str
    event: NotificationEvent
    channel: NotificationChannel
    idempotency_key: str
    subject: str
    text: str
    html: str
    template_values: Mapping[str, str]


@dataclass(frozen=True)
class DispatchRecord:
    dispatch_id: str
    episode_key: str
    incident_id: str
    event: NotificationEvent
    channel: NotificationChannel
    state: DeliveryState
    provider_message_id: str | None
    recipient_fingerprint: str
    error_code: str | None
    attempt_count: int
    created_at: datetime
    updated_at: datetime
