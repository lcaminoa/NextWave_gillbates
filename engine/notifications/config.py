"""Environment-only configuration for external notification providers.

No token, phone number, email address, or endpoint is ever read by frontend code.  The default
is disabled so a local engine cannot send a message merely because a report was generated.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Mapping


class NotificationMode(str, Enum):
    demo = "demo"
    production = "production"


class WhatsAppMessageMode(str, Enum):
    text = "text"
    template = "template"


_TRUE_VALUES = {"1", "true", "yes", "on"}
_TEMPLATE_FIELDS = {
    "incident_id",
    "status",
    "estimated_revenue_loss_usd_per_hour",
    "incident_url",
}
_GRAPH_API_VERSION = re.compile(r"v\d+\.\d+")
_PHONE_NUMBER_ID = re.compile(r"\d+")


def _required(environ: Mapping[str, str], name: str) -> str:
    value = environ.get(name, "").strip()
    if not value:
        raise ValueError(f"notifications enabled but {name} is missing")
    return value


def _enabled(value: str | None) -> bool:
    return (value or "").strip().lower() in _TRUE_VALUES


def _normalise_phone(value: str) -> str:
    digits = re.sub(r"[^0-9]", "", value)
    if not 8 <= len(digits) <= 15:
        raise ValueError("PHAROS_NOTIFICATION_WHATSAPP_TO must be an E.164 phone number")
    return digits


@dataclass(frozen=True)
class ResendSettings:
    api_key: str
    from_address: str
    to_address: str


@dataclass(frozen=True)
class WhatsAppSettings:
    access_token: str
    api_version: str
    phone_number_id: str
    recipient: str
    message_mode: WhatsAppMessageMode
    template_name: str | None
    template_language: str | None
    template_fields: tuple[str, ...]


@dataclass(frozen=True)
class NotificationSettings:
    enabled: bool
    mode: NotificationMode
    database_path: Path
    incident_base_url: str
    request_timeout_seconds: float
    resend: ResendSettings | None
    whatsapp: WhatsAppSettings | None

    @classmethod
    def from_environment(
        cls,
        environ: Mapping[str, str] | None = None,
    ) -> "NotificationSettings":
        source = os.environ if environ is None else environ
        enabled = _enabled(source.get("PHAROS_NOTIFICATIONS_ENABLED"))
        database_path = Path(
            source.get(
                "PHAROS_NOTIFICATION_DB_PATH",
                ".runtime/pharos-notifications.sqlite3",
            )
        )
        if not enabled:
            return cls(
                enabled=False,
                mode=NotificationMode.demo,
                database_path=database_path,
                incident_base_url="http://localhost:3000",
                request_timeout_seconds=8.0,
                resend=None,
                whatsapp=None,
            )

        raw_mode = _required(source, "PHAROS_NOTIFICATION_MODE").lower()
        try:
            mode = NotificationMode(raw_mode)
        except ValueError as exc:
            raise ValueError("PHAROS_NOTIFICATION_MODE must be demo or production") from exc

        raw_timeout = source.get("PHAROS_NOTIFICATION_REQUEST_TIMEOUT_SECONDS", "8").strip()
        try:
            request_timeout_seconds = float(raw_timeout)
        except ValueError as exc:
            raise ValueError("PHAROS_NOTIFICATION_REQUEST_TIMEOUT_SECONDS must be numeric") from exc
        if not 0 < request_timeout_seconds <= 30:
            raise ValueError("PHAROS_NOTIFICATION_REQUEST_TIMEOUT_SECONDS must be between 0 and 30")

        resend = ResendSettings(
            api_key=_required(source, "RESEND_API_KEY"),
            from_address=_required(source, "RESEND_FROM"),
            to_address=_required(source, "PHAROS_NOTIFICATION_EMAIL_TO"),
        )

        raw_message_mode = _required(source, "PHAROS_WA_MESSAGE_MODE").lower()
        try:
            message_mode = WhatsAppMessageMode(raw_message_mode)
        except ValueError as exc:
            raise ValueError("PHAROS_WA_MESSAGE_MODE must be text or template") from exc

        template_name: str | None = None
        template_language: str | None = None
        template_fields: tuple[str, ...] = ()
        if message_mode is WhatsAppMessageMode.template:
            template_name = _required(source, "PHAROS_WA_TEMPLATE_NAME")
            template_language = _required(source, "PHAROS_WA_TEMPLATE_LANGUAGE")
            template_fields = tuple(
                field.strip()
                for field in source.get("PHAROS_WA_TEMPLATE_FIELDS", "").split(",")
                if field.strip()
            )
            unknown_fields = set(template_fields) - _TEMPLATE_FIELDS
            if unknown_fields:
                raise ValueError(
                    "PHAROS_WA_TEMPLATE_FIELDS has unsupported values: "
                    + ", ".join(sorted(unknown_fields))
                )
            if len(set(template_fields)) != len(template_fields):
                raise ValueError("PHAROS_WA_TEMPLATE_FIELDS cannot repeat a field")

        api_version = _required(source, "PHAROS_WA_API_VERSION")
        if not _GRAPH_API_VERSION.fullmatch(api_version):
            raise ValueError("PHAROS_WA_API_VERSION must look like v23.0")
        phone_number_id = _required(source, "PHAROS_WA_PHONE_NUMBER_ID")
        if not _PHONE_NUMBER_ID.fullmatch(phone_number_id):
            raise ValueError("PHAROS_WA_PHONE_NUMBER_ID must contain only digits")

        whatsapp = WhatsAppSettings(
            access_token=_required(source, "PHAROS_WA_ACCESS_TOKEN"),
            api_version=api_version,
            phone_number_id=phone_number_id,
            recipient=_normalise_phone(_required(source, "PHAROS_NOTIFICATION_WHATSAPP_TO")),
            message_mode=message_mode,
            template_name=template_name,
            template_language=template_language,
            template_fields=template_fields,
        )

        return cls(
            enabled=True,
            mode=mode,
            database_path=database_path,
            incident_base_url=_required(source, "PHAROS_NOTIFICATION_INCIDENT_BASE_URL").rstrip("/"),
            request_timeout_seconds=request_timeout_seconds,
            resend=resend,
            whatsapp=whatsapp,
        )
