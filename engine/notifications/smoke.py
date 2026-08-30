"""Explicit, opt-in real-provider smoke test for the two notification channels.

Run only after the dedicated Resend and Meta demo credentials are set in the local environment.
The required confirmation variable prevents CI or an accidental import from sending messages.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone

from contracts.schemas import IncidentReport, ReportStatus
from engine.notifications.models import DeliveryState
from engine.notifications.service import NotificationService


def _smoke_report() -> IncidentReport:
    suffix = uuid.uuid4().hex[:10]
    return IncidentReport(
        incident_id=f"inc_notification_smoke_{suffix}",
        anomaly_id=f"anom_notification_smoke_{suffix}",
        generated_at=datetime.now(timezone.utc),
        status=ReportStatus.probable,
        winning_candidate_id="cand_notification_smoke",
        summary="Smoke test explícito de los canales de alerta.",
        claims=[],
        estimated_revenue_loss_usd_per_hour=0.0,
        recommended_action="No ejecutar acciones; confirmar la recepción de ambas alertas.",
        requires_human_review=True,
        investigation_steps=[],
    )


def main() -> int:
    if os.getenv("PHAROS_NOTIFICATION_SMOKE_TEST") != "1":
        print(
            "Refusing to send. Set PHAROS_NOTIFICATION_SMOKE_TEST=1 for this explicit smoke test.",
            file=sys.stderr,
        )
        return 2
    service = NotificationService.from_environment()
    if not service.enabled:
        print("PHAROS_NOTIFICATIONS_ENABLED must be true for a real smoke test.", file=sys.stderr)
        return 2
    report = _smoke_report()
    service.enqueue_report(report, episode_key=f"notification-smoke:{report.incident_id}")
    service.drain_until_empty()
    records = service.records_for_incident(report.incident_id)
    for record in records:
        print(
            f"{record.channel.value}: {record.state.value}"
            + (
                f" (provider id: {record.provider_message_id})"
                if record.provider_message_id
                else ""
            )
        )
    accepted = len(records) == 2 and all(
        record.state is DeliveryState.accepted for record in records
    )
    return 0 if accepted else 1


if __name__ == "__main__":
    raise SystemExit(main())
