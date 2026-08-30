"""Non-blocking incident notification orchestration.

The runtime only inserts durable jobs. This worker is the sole place that can call an external
provider, so a slow, failed, or ambiguous notification never affects detection or investigation.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from collections.abc import Mapping

from contracts.schemas import IncidentReport, ReportStatus
from engine.notifications.config import NotificationSettings
from engine.notifications.content import incident_html, incident_text, template_values
from engine.notifications.http import JsonPoster, ProviderRequestError, UrllibJsonPoster
from engine.notifications.models import (
    DeliveryState,
    DispatchRecord,
    NotificationChannel,
    NotificationEvent,
)
from engine.notifications.outbox import NotificationOutbox
from engine.notifications.providers import (
    NotificationProvider,
    ResendProvider,
    WhatsAppCloudProvider,
)


logger = logging.getLogger(__name__)


class NotificationService:
    """Queues one email and one WhatsApp alert for each eligible incident episode."""

    def __init__(
        self,
        settings: NotificationSettings,
        *,
        poster: JsonPoster | None = None,
        providers: Mapping[NotificationChannel, NotificationProvider] | None = None,
        outbox: NotificationOutbox | None = None,
        worker_poll_seconds: float = 0.25,
    ) -> None:
        if worker_poll_seconds <= 0:
            raise ValueError("worker_poll_seconds must be positive")
        self.settings = settings
        self._worker_poll_seconds = worker_poll_seconds
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._worker: threading.Thread | None = None

        if not settings.enabled:
            self._outbox: NotificationOutbox | None = None
            self._providers: dict[NotificationChannel, NotificationProvider] = {}
            return

        if settings.resend is None or settings.whatsapp is None:
            raise ValueError("enabled notifications require both Resend and WhatsApp settings")
        poster = poster or UrllibJsonPoster()
        configured = providers if providers is not None else {
            NotificationChannel.email: ResendProvider(
                settings.resend,
                poster=poster,
                timeout_seconds=settings.request_timeout_seconds,
            ),
            NotificationChannel.whatsapp: WhatsAppCloudProvider(
                settings.whatsapp,
                poster=poster,
                timeout_seconds=settings.request_timeout_seconds,
            ),
        }
        expected_channels = {NotificationChannel.email, NotificationChannel.whatsapp}
        if set(configured) != expected_channels:
            raise ValueError("enabled notifications require exactly email and WhatsApp providers")
        self._providers = dict(configured)
        self._outbox = outbox or NotificationOutbox(settings.database_path)

    @classmethod
    def from_environment(cls) -> "NotificationService":
        return cls(NotificationSettings.from_environment())

    @property
    def enabled(self) -> bool:
        return self.settings.enabled

    def start(self) -> None:
        """Start a daemon worker after the runtime itself is healthy enough to publish."""

        if not self.enabled:
            return
        worker = self._worker
        if worker is not None and worker.is_alive():
            return
        self._stop.clear()
        self._wake.set()
        self._worker = threading.Thread(
            target=self._run,
            name="pharos-notification-worker",
            daemon=True,
        )
        self._worker.start()

    def stop(self) -> None:
        """Stop promptly; records already in ``sending`` remain honestly ``unknown`` on restart."""

        worker = self._worker
        self._worker = None
        if worker is None:
            return
        self._stop.set()
        self._wake.set()
        worker.join(timeout=self.settings.request_timeout_seconds + 1.0)
        if worker.is_alive():
            logger.warning("Notification worker did not stop before the configured timeout")

    def enqueue_report(
        self,
        report: IncidentReport,
        *,
        episode_key: str,
    ) -> list[DispatchRecord]:
        """Persist both channel jobs and return their non-sensitive ledger records.

        No provider call happens here. Inconclusive reports deliberately remain in the product's
        evidence queue but do not interrupt an operator outside the application.
        """

        if not self.enabled or not self._is_eligible(report):
            return []
        outbox = self._outbox
        if outbox is None:
            raise RuntimeError("enabled notification service has no outbox")

        values = template_values(report, self.settings.incident_base_url)
        text = incident_text(report, self.settings.incident_base_url)
        html = incident_html(report, self.settings.incident_base_url)
        event = NotificationEvent.incident_detected
        records: list[DispatchRecord] = []
        created = False
        for channel in (NotificationChannel.email, NotificationChannel.whatsapp):
            provider = self._providers[channel]
            dedupe_key = self._dedupe_key(episode_key, event, channel)
            result = outbox.enqueue(
                episode_key=episode_key,
                incident_id=report.incident_id,
                event=event,
                channel=channel,
                dedupe_key=dedupe_key,
                idempotency_key=f"pharos/{event.value}/{dedupe_key}",
                recipient_fingerprint=provider.recipient_fingerprint,
                subject=f"PHAROS · incidente de pagos {report.incident_id}",
                text=text,
                html=html,
                template_values=values,
            )
            records.append(result.record)
            created = created or result.created
        if created:
            self._wake.set()
        return records

    @staticmethod
    def _is_eligible(report: IncidentReport) -> bool:
        return report.status in {ReportStatus.confirmed, ReportStatus.probable}

    @staticmethod
    def _dedupe_key(
        episode_key: str,
        event: NotificationEvent,
        channel: NotificationChannel,
    ) -> str:
        material = f"pharos:v1:{episode_key}:{event.value}:{channel.value}".encode("utf-8")
        return hashlib.sha256(material).hexdigest()

    def drain_once(self) -> bool:
        """Deliver one queued job. Tests use this deterministic seam instead of a thread."""

        if not self.enabled:
            return False
        outbox = self._outbox
        if outbox is None:
            raise RuntimeError("enabled notification service has no outbox")
        claimed = outbox.claim_next()
        if claimed is None:
            return False
        provider = self._providers[claimed.record.channel]
        try:
            receipt = provider.send(claimed.message)
        except ProviderRequestError as exc:
            terminal_state = (
                DeliveryState.unknown if exc.uncertain else DeliveryState.failed
            )
            outbox.mark(
                claimed.record.dispatch_id,
                state=terminal_state,
                error_code=exc.error_code,
            )
            logger.warning(
                "Notification dispatch finished without provider acceptance: channel=%s state=%s code=%s",
                claimed.record.channel.value,
                terminal_state.value,
                exc.error_code,
            )
        except Exception:
            # The call might have crossed the network boundary before a provider adapter raised.
            # Conservatively preserve it as unknown and require an explicit operator decision.
            outbox.mark(
                claimed.record.dispatch_id,
                state=DeliveryState.unknown,
                error_code="unexpected_provider_error",
            )
            logger.exception(
                "Notification provider raised unexpectedly: channel=%s",
                claimed.record.channel.value,
            )
        else:
            outbox.mark(
                claimed.record.dispatch_id,
                state=DeliveryState.accepted,
                provider_message_id=receipt.provider_message_id,
            )
        return True

    def drain_until_empty(self, *, max_jobs: int = 32) -> int:
        """Deterministically drain a bounded number of queued records for tests/manual smoke."""

        if max_jobs < 1:
            raise ValueError("max_jobs must be positive")
        count = 0
        while count < max_jobs and self.drain_once():
            count += 1
        return count

    def records_for_incident(self, incident_id: str) -> list[DispatchRecord]:
        if not self.enabled or self._outbox is None:
            return []
        return self._outbox.records_for_incident(incident_id)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                delivered = self.drain_until_empty()
            except Exception:
                # SQLite or an adapter setup error must remain isolated from the runtime worker.
                logger.exception("Notification worker could not drain its outbox")
                delivered = 0
            if delivered:
                continue
            self._wake.wait(self._worker_poll_seconds)
            self._wake.clear()
