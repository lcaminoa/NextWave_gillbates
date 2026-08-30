from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic, sleep

import pytest

from contracts.schemas import IncidentReport, ReportStatus
from engine.notifications.config import (
    NotificationSettings,
    ResendSettings,
    WhatsAppMessageMode,
    WhatsAppSettings,
)
from engine.notifications.http import JsonResponse, ProviderRequestError
from engine.notifications.models import (
    DeliveryState,
    NotificationChannel,
    NotificationEvent,
    OutboundMessage,
    ProviderReceipt,
)
from engine.notifications.outbox import NotificationOutbox
from engine.notifications.providers import ResendProvider, WhatsAppCloudProvider
from engine.notifications.service import NotificationService


def _report(status: ReportStatus = ReportStatus.confirmed) -> IncidentReport:
    return IncidentReport(
        incident_id="inc_demo_001",
        anomaly_id="anom_demo_001",
        generated_at=datetime(2026, 8, 29, 14, 0, tzinfo=timezone.utc),
        status=status,
        winning_candidate_id=None if status is ReportStatus.inconclusive else "cand_demo_001",
        summary="La caída de aprobación requiere revisión.",
        claims=[],
        estimated_revenue_loss_usd_per_hour=12_500.0,
        recommended_action="Revisar el proveedor con un operador.",
        requires_human_review=True,
        investigation_steps=[],
    )


def _enabled_environment(tmp_path: Path, **overrides: str) -> dict[str, str]:
    environment = {
        "PHAROS_NOTIFICATIONS_ENABLED": "true",
        "PHAROS_NOTIFICATION_MODE": "demo",
        "PHAROS_NOTIFICATION_DB_PATH": str(tmp_path / "notifications.sqlite3"),
        "PHAROS_NOTIFICATION_INCIDENT_BASE_URL": "http://localhost:3000",
        "PHAROS_NOTIFICATION_REQUEST_TIMEOUT_SECONDS": "3",
        "RESEND_API_KEY": "resend-test-token",
        "RESEND_FROM": "PHAROS <onboarding@resend.dev>",
        "PHAROS_NOTIFICATION_EMAIL_TO": "operator@example.test",
        "PHAROS_WA_ACCESS_TOKEN": "whatsapp-test-token",
        "PHAROS_WA_API_VERSION": "v23.0",
        "PHAROS_WA_PHONE_NUMBER_ID": "1234567890",
        "PHAROS_NOTIFICATION_WHATSAPP_TO": "+5491112345678",
        "PHAROS_WA_MESSAGE_MODE": "text",
    }
    environment.update(overrides)
    return environment


class RecordingProvider:
    def __init__(
        self,
        channel: NotificationChannel,
        outcomes: list[ProviderReceipt | Exception],
    ) -> None:
        self.channel = channel
        self._outcomes = list(outcomes)
        self.messages: list[OutboundMessage] = []

    @property
    def recipient_fingerprint(self) -> str:
        return f"fingerprint-{self.channel.value}"

    def send(self, message: OutboundMessage) -> ProviderReceipt:
        self.messages.append(message)
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class FakeJsonPoster:
    def __init__(self, outcomes: list[JsonResponse | Exception]) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[dict[str, object]] = []

    def post_json(
        self,
        url: str,
        *,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> JsonResponse:
        self.calls.append(
            {
                "url": url,
                "headers": dict(headers),
                "payload": dict(payload),
                "timeout_seconds": timeout_seconds,
            }
        )
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _service(
    tmp_path: Path,
    *,
    email_outcomes: list[ProviderReceipt | Exception] | None = None,
    whatsapp_outcomes: list[ProviderReceipt | Exception] | None = None,
) -> tuple[NotificationService, RecordingProvider, RecordingProvider]:
    settings = NotificationSettings.from_environment(_enabled_environment(tmp_path))
    email = RecordingProvider(
        NotificationChannel.email,
        email_outcomes or [ProviderReceipt(provider_message_id="email_001")],
    )
    whatsapp = RecordingProvider(
        NotificationChannel.whatsapp,
        whatsapp_outcomes or [ProviderReceipt(provider_message_id="wa_001")],
    )
    service = NotificationService(
        settings,
        providers={NotificationChannel.email: email, NotificationChannel.whatsapp: whatsapp},
    )
    return service, email, whatsapp


def _message(channel: NotificationChannel) -> OutboundMessage:
    return OutboundMessage(
        dispatch_id="dispatch_001",
        episode_key="episode_001",
        incident_id="inc_demo_001",
        event=NotificationEvent.incident_detected,
        channel=channel,
        idempotency_key="pharos/incident_detected/idempotent_001",
        subject="PHAROS · incidente de pagos inc_demo_001",
        text="PHAROS · incidente inc_demo_001",
        html="<p>PHAROS</p>",
        template_values={
            "incident_id": "inc_demo_001",
            "status": "confirmed",
            "estimated_revenue_loss_usd_per_hour": "USD 12,500/h",
            "incident_url": "http://localhost:3000/investigations",
        },
    )


def test_both_channels_are_durable_and_sent_once_per_episode(tmp_path: Path) -> None:
    service, email, whatsapp = _service(tmp_path)

    first = service.enqueue_report(_report(), episode_key="episode_001")
    duplicate = service.enqueue_report(_report(), episode_key="episode_001")

    assert {record.channel for record in first} == {
        NotificationChannel.email,
        NotificationChannel.whatsapp,
    }
    assert {record.state for record in duplicate} == {DeliveryState.queued}
    assert service.drain_until_empty() == 2
    assert service.drain_until_empty() == 0
    assert len(email.messages) == 1
    assert len(whatsapp.messages) == 1
    assert all(
        record.state is DeliveryState.accepted
        for record in service.records_for_incident("inc_demo_001")
    )


def test_inconclusive_report_never_creates_an_external_alert(tmp_path: Path) -> None:
    service, email, whatsapp = _service(tmp_path)

    assert service.enqueue_report(
        _report(ReportStatus.inconclusive), episode_key="episode_001"
    ) == []
    assert service.drain_until_empty() == 0
    assert email.messages == []
    assert whatsapp.messages == []


def test_channel_failure_isolated_from_the_other_channel(tmp_path: Path) -> None:
    service, email, whatsapp = _service(
        tmp_path,
        email_outcomes=[ProviderRequestError("resend_http_403")],
        whatsapp_outcomes=[ProviderReceipt(provider_message_id="wa_accepted")],
    )
    service.enqueue_report(_report(), episode_key="episode_001")

    assert service.drain_until_empty() == 2
    records = {record.channel: record for record in service.records_for_incident("inc_demo_001")}
    assert records[NotificationChannel.email].state is DeliveryState.failed
    assert records[NotificationChannel.email].error_code == "resend_http_403"
    assert records[NotificationChannel.whatsapp].state is DeliveryState.accepted
    assert records[NotificationChannel.whatsapp].provider_message_id == "wa_accepted"
    assert len(email.messages) == 1
    assert len(whatsapp.messages) == 1


def test_ambiguous_provider_result_is_never_retried_automatically(tmp_path: Path) -> None:
    service, email, whatsapp = _service(
        tmp_path,
        email_outcomes=[ProviderRequestError("network_or_timeout", uncertain=True)],
    )
    service.enqueue_report(_report(), episode_key="episode_001")

    assert service.drain_until_empty() == 2
    assert service.drain_until_empty() == 0
    records = {record.channel: record for record in service.records_for_incident("inc_demo_001")}
    assert records[NotificationChannel.email].state is DeliveryState.unknown
    assert records[NotificationChannel.email].attempt_count == 1
    assert len(email.messages) == 1
    assert len(whatsapp.messages) == 1


def test_started_worker_drains_the_outbox_without_blocking_the_caller(tmp_path: Path) -> None:
    service, email, whatsapp = _service(tmp_path)
    service.start()
    try:
        service.enqueue_report(_report(), episode_key="episode_001")
        deadline = monotonic() + 1.0
        while monotonic() < deadline and (not email.messages or not whatsapp.messages):
            sleep(0.01)
    finally:
        service.stop()

    assert len(email.messages) == 1
    assert len(whatsapp.messages) == 1


def test_interrupted_sending_record_becomes_unknown_on_restart(tmp_path: Path) -> None:
    outbox_path = tmp_path / "notifications.sqlite3"
    outbox = NotificationOutbox(outbox_path)
    outbox.enqueue(
        episode_key="episode_001",
        incident_id="inc_demo_001",
        event=NotificationEvent.incident_detected,
        channel=NotificationChannel.whatsapp,
        dedupe_key="dedupe_001",
        idempotency_key="idempotency_001",
        recipient_fingerprint="fingerprint",
        subject="subject",
        text="text",
        html="html",
        template_values={},
    )
    claimed = outbox.claim_next()
    assert claimed is not None
    assert claimed.record.state is DeliveryState.sending

    restarted = NotificationOutbox(outbox_path)
    [record] = restarted.all_records()

    assert record.state is DeliveryState.unknown
    assert record.error_code == "interrupted_during_send"


def test_disabled_mode_never_constructs_or_uses_a_live_outbox(tmp_path: Path) -> None:
    path = tmp_path / "disabled.sqlite3"
    settings = NotificationSettings.from_environment(
        {
            "PHAROS_NOTIFICATIONS_ENABLED": "false",
            "PHAROS_NOTIFICATION_DB_PATH": str(path),
            "RESEND_API_KEY": "accidental-key-is-ignored",
            "PHAROS_WA_ACCESS_TOKEN": "accidental-key-is-ignored",
        }
    )
    service = NotificationService(settings)

    assert not service.enabled
    assert service.enqueue_report(_report(), episode_key="episode_001") == []
    assert service.drain_until_empty() == 0
    assert not path.exists()


def test_enabled_mode_requires_complete_dual_channel_configuration(tmp_path: Path) -> None:
    environment = _enabled_environment(tmp_path)
    del environment["RESEND_API_KEY"]

    with pytest.raises(ValueError, match="RESEND_API_KEY"):
        NotificationSettings.from_environment(environment)


def test_resend_serialization_includes_idempotency_key_and_redacts_error() -> None:
    settings = ResendSettings(
        api_key="resend-test-token",
        from_address="PHAROS <onboarding@resend.dev>",
        to_address="operator@example.test",
    )
    poster = FakeJsonPoster([JsonResponse(status_code=200, payload={"id": "email_001"})])
    provider = ResendProvider(settings, poster=poster, timeout_seconds=4)

    receipt = provider.send(_message(NotificationChannel.email))

    assert receipt.provider_message_id == "email_001"
    [call] = poster.calls
    assert call["url"] == "https://api.resend.com/emails"
    assert call["headers"] == {
        "Authorization": "Bearer resend-test-token",
        "Content-Type": "application/json",
        "Idempotency-Key": "pharos/incident_detected/idempotent_001",
        "User-Agent": "pharos-control-tower/1.0",
    }
    assert call["payload"] == {
        "from": "PHAROS <onboarding@resend.dev>",
        "to": ["operator@example.test"],
        "subject": "PHAROS · incidente de pagos inc_demo_001",
        "html": "<p>PHAROS</p>",
        "text": "PHAROS · incidente inc_demo_001",
    }

    failing = ResendProvider(
        settings,
        poster=FakeJsonPoster([JsonResponse(status_code=403, payload={"message": "no"})]),
        timeout_seconds=4,
    )
    with pytest.raises(ProviderRequestError) as error:
        failing.send(_message(NotificationChannel.email))
    assert error.value.error_code == "resend_http_403"
    assert "resend-test-token" not in error.value.error_code


def test_whatsapp_text_and_template_payloads_are_exact() -> None:
    text_settings = WhatsAppSettings(
        access_token="whatsapp-test-token",
        api_version="v23.0",
        phone_number_id="1234567890",
        recipient="5491112345678",
        message_mode=WhatsAppMessageMode.text,
        template_name=None,
        template_language=None,
        template_fields=(),
    )
    poster = FakeJsonPoster(
        [JsonResponse(status_code=200, payload={"messages": [{"id": "wa_text"}]})]
    )
    text_provider = WhatsAppCloudProvider(text_settings, poster=poster, timeout_seconds=4)
    assert text_provider.send(_message(NotificationChannel.whatsapp)).provider_message_id == "wa_text"
    [text_call] = poster.calls
    assert text_call["url"] == "https://graph.facebook.com/v23.0/1234567890/messages"
    assert text_call["payload"] == {
        "messaging_product": "whatsapp",
        "to": "5491112345678",
        "type": "text",
        "text": {"preview_url": False, "body": "PHAROS · incidente inc_demo_001"},
    }

    template_settings = WhatsAppSettings(
        access_token="whatsapp-test-token",
        api_version="v23.0",
        phone_number_id="1234567890",
        recipient="5491112345678",
        message_mode=WhatsAppMessageMode.template,
        template_name="incident_alert",
        template_language="es_AR",
        template_fields=("incident_id", "status"),
    )
    template_poster = FakeJsonPoster(
        [JsonResponse(status_code=200, payload={"messages": [{"id": "wa_template"}]})]
    )
    template_provider = WhatsAppCloudProvider(
        template_settings,
        poster=template_poster,
        timeout_seconds=4,
    )
    assert (
        template_provider.send(_message(NotificationChannel.whatsapp)).provider_message_id
        == "wa_template"
    )
    [template_call] = template_poster.calls
    assert template_call["payload"] == {
        "messaging_product": "whatsapp",
        "to": "5491112345678",
        "type": "template",
        "template": {
            "name": "incident_alert",
            "language": {"code": "es_AR"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": "inc_demo_001"},
                        {"type": "text", "text": "confirmed"},
                    ],
                }
            ],
        },
    }
