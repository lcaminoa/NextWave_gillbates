"""The incident detail reports what became of each external alert.

Two things are being protected here: that the ledger reaches the API at all, and
that the recipient never does. `recipient_fingerprint` exists on the outbox record
and must not appear on the wire — recipients live in process configuration, and a
hash of one is still a thing a browser has no business holding.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from engine.api import NotificationDispatchView
from engine.api.runtime import ControlTowerService
from engine.notifications.models import (
    DeliveryState,
    DispatchRecord,
    NotificationChannel,
    NotificationEvent,
)


def _record(
    *,
    incident_id: str,
    channel: NotificationChannel,
    state: DeliveryState,
    provider_message_id: str | None = None,
    error_code: str | None = None,
) -> DispatchRecord:
    moment = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)
    return DispatchRecord(
        dispatch_id=f"dispatch-{channel.value}",
        episode_key="episode-1",
        incident_id=incident_id,
        event=NotificationEvent.incident_detected,
        channel=channel,
        state=state,
        provider_message_id=provider_message_id,
        recipient_fingerprint="sha256:must-never-be-published",
        error_code=error_code,
        attempt_count=1,
        created_at=moment,
        updated_at=moment,
    )


class _Sink:
    """Stands in for NotificationService with only the boundary the runtime uses."""

    def __init__(self, records: list[DispatchRecord] | None = None, *, raises: bool = False):
        self._records = records or []
        self._raises = raises
        self.asked_for: list[str] = []

    def start(self) -> None: ...

    def stop(self) -> None: ...

    def enqueue_report(self, report, *, episode_key):  # pragma: no cover - unused here
        return None

    def records_for_incident(self, incident_id: str) -> list[DispatchRecord]:
        self.asked_for.append(incident_id)
        if self._raises:
            raise RuntimeError("outbox unavailable")
        return [record for record in self._records if record.incident_id == incident_id]


def _service(sink: _Sink) -> ControlTowerService:
    return ControlTowerService(notifications=sink)


def test_dispatch_view_projects_state_without_the_recipient() -> None:
    record = _record(
        incident_id="inc-1",
        channel=NotificationChannel.email,
        state=DeliveryState.accepted,
        provider_message_id="resend:re_123",
    )

    view = NotificationDispatchView(
        channel=record.channel.value,
        state=record.state.value,
        updated_at=record.updated_at,
        attempt_count=record.attempt_count,
        provider_reference=record.provider_message_id,
        error_code=record.error_code,
    )

    payload = view.model_dump()
    assert payload["channel"] == "email"
    assert payload["state"] == "accepted"
    assert payload["provider_reference"] == "resend:re_123"
    assert "recipient_fingerprint" not in payload
    assert "must-never-be-published" not in str(payload)


def test_dispatch_view_never_admits_a_delivered_state() -> None:
    """`accepted` is a provider taking the message. Only a delivery callback can
    say more than that, and there is no such callback, so the vocabulary has no
    word for it."""
    with pytest.raises(ValueError):
        NotificationDispatchView(
            channel="email",
            state="delivered",
            updated_at=datetime.now(timezone.utc),
            attempt_count=1,
        )


def test_projection_reads_the_ledger_for_the_requested_incident() -> None:
    sink = _Sink(
        [
            _record(incident_id="inc-1", channel=NotificationChannel.email, state=DeliveryState.accepted),
            _record(incident_id="inc-1", channel=NotificationChannel.whatsapp, state=DeliveryState.sending),
            _record(incident_id="inc-2", channel=NotificationChannel.email, state=DeliveryState.failed),
        ]
    )

    views = _service(sink)._notification_dispatches("inc-1")

    assert sink.asked_for == ["inc-1"]
    assert [(view.channel, view.state) for view in views] == [
        ("email", "accepted"),
        ("whatsapp", "sending"),
    ]


def test_a_broken_ledger_degrades_to_nothing_to_report() -> None:
    """Alerting is a side effect of an incident, never a precondition for reading
    one. A failing outbox must not take the incident detail down with it."""
    views = _service(_Sink(raises=True))._notification_dispatches("inc-1")
    assert views == []


def test_a_sink_without_a_reader_is_tolerated() -> None:
    class _Older:
        def start(self) -> None: ...

        def stop(self) -> None: ...

        def enqueue_report(self, report, *, episode_key):
            return None

    views = _service(_Older())._notification_dispatches("inc-1")  # type: ignore[arg-type]
    assert views == []
