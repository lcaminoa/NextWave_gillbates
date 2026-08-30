"""Thin, testable adapters for Resend and WhatsApp Cloud API."""

from __future__ import annotations

import hashlib
from typing import Protocol

from engine.notifications.config import ResendSettings, WhatsAppMessageMode, WhatsAppSettings
from engine.notifications.http import JsonPoster, ProviderRequestError
from engine.notifications.models import NotificationChannel, OutboundMessage, ProviderReceipt


class NotificationProvider(Protocol):
    channel: NotificationChannel

    @property
    def recipient_fingerprint(self) -> str: ...

    def send(self, message: OutboundMessage) -> ProviderReceipt: ...


def _fingerprint(channel: NotificationChannel, recipient: str) -> str:
    raw = f"pharos-notification-recipient:v1:{channel.value}:{recipient}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


class ResendProvider:
    channel = NotificationChannel.email

    def __init__(
        self,
        settings: ResendSettings,
        *,
        poster: JsonPoster,
        timeout_seconds: float,
    ) -> None:
        self._settings = settings
        self._poster = poster
        self._timeout_seconds = timeout_seconds

    @property
    def recipient_fingerprint(self) -> str:
        return _fingerprint(self.channel, self._settings.to_address)

    def send(self, message: OutboundMessage) -> ProviderReceipt:
        if message.channel is not self.channel:
            raise ValueError("email provider received a message for another channel")
        response = self._poster.post_json(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {self._settings.api_key}",
                "Content-Type": "application/json",
                "Idempotency-Key": message.idempotency_key,
                "User-Agent": "pharos-control-tower/1.0",
            },
            payload={
                "from": self._settings.from_address,
                "to": [self._settings.to_address],
                "subject": message.subject,
                "html": message.html,
                "text": message.text,
            },
            timeout_seconds=self._timeout_seconds,
        )
        if not 200 <= response.status_code < 300:
            raise ProviderRequestError(f"resend_http_{response.status_code}")
        provider_message_id = response.payload.get("id")
        if not isinstance(provider_message_id, str) or not provider_message_id:
            raise ProviderRequestError("resend_missing_message_id", uncertain=True)
        return ProviderReceipt(provider_message_id=provider_message_id)


class WhatsAppCloudProvider:
    channel = NotificationChannel.whatsapp

    def __init__(
        self,
        settings: WhatsAppSettings,
        *,
        poster: JsonPoster,
        timeout_seconds: float,
    ) -> None:
        self._settings = settings
        self._poster = poster
        self._timeout_seconds = timeout_seconds

    @property
    def recipient_fingerprint(self) -> str:
        return _fingerprint(self.channel, self._settings.recipient)

    def send(self, message: OutboundMessage) -> ProviderReceipt:
        if message.channel is not self.channel:
            raise ValueError("WhatsApp provider received a message for another channel")
        response = self._poster.post_json(
            (
                "https://graph.facebook.com/"
                f"{self._settings.api_version}/{self._settings.phone_number_id}/messages"
            ),
            headers={
                "Authorization": f"Bearer {self._settings.access_token}",
                "Content-Type": "application/json",
            },
            payload=self._payload(message),
            timeout_seconds=self._timeout_seconds,
        )
        if not 200 <= response.status_code < 300:
            raise ProviderRequestError(f"whatsapp_http_{response.status_code}")
        messages = response.payload.get("messages")
        provider_message_id: object | None = None
        if isinstance(messages, list) and messages and isinstance(messages[0], dict):
            provider_message_id = messages[0].get("id")
        if not isinstance(provider_message_id, str) or not provider_message_id:
            raise ProviderRequestError("whatsapp_missing_message_id", uncertain=True)
        return ProviderReceipt(provider_message_id=provider_message_id)

    def _payload(self, message: OutboundMessage) -> dict[str, object]:
        base: dict[str, object] = {
            "messaging_product": "whatsapp",
            "to": self._settings.recipient,
        }
        if self._settings.message_mode is WhatsAppMessageMode.text:
            return {
                **base,
                "type": "text",
                "text": {"preview_url": False, "body": message.text},
            }

        parameters = [
            {"type": "text", "text": message.template_values[field]}
            for field in self._settings.template_fields
        ]
        template: dict[str, object] = {
            "name": self._settings.template_name,
            "language": {"code": self._settings.template_language},
        }
        if parameters:
            template["components"] = [{"type": "body", "parameters": parameters}]
        return {**base, "type": "template", "template": template}
