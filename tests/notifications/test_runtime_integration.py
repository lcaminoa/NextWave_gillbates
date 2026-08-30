from __future__ import annotations

from datetime import datetime, timedelta, timezone

from contracts.schemas import (
    Anomaly,
    Dimensions,
    Evidence,
    IncidentCandidate,
    Severity,
    Transaction,
)
from engine.api.runtime import ControlTowerService
from engine.detection.pipeline import AnomalyDiagnosis, WindowResult
from simulator import PaymentSimulator


START = datetime(2026, 8, 29, 14, 0, tzinfo=timezone.utc)


class FakePipeline:
    def __init__(self, results: list[WindowResult]) -> None:
        self._results = list(results)

    def ingest(self, _: Transaction) -> list[WindowResult]:
        return [self._results.pop(0)] if self._results else []

    def flush(self) -> WindowResult | None:
        return None


class RecordingNotificationSink:
    def __init__(self, *, should_fail: bool = False) -> None:
        self.should_fail = should_fail
        self.started = 0
        self.stopped = 0
        self.calls: list[tuple[str, str]] = []

    def start(self) -> None:
        self.started += 1

    def stop(self) -> None:
        self.stopped += 1

    def enqueue_report(self, report, *, episode_key: str) -> None:
        self.calls.append((report.incident_id, episode_key))
        if self.should_fail:
            raise RuntimeError("synthetic outbox fault")


def _transaction(index: int) -> Transaction:
    return Transaction(
        transaction_id=f"txn_notification_{index}",
        timestamp=START + timedelta(seconds=index),
        merchant="VuelaYa",
        provider="nova_pay",
        payment_method="card",
        country="BR",
        issuing_bank="itau",
        approved=True,
        amount=100.0,
        currency="USD",
        latency_ms=180,
    )


def _diagnosis(suffix: str) -> AnomalyDiagnosis:
    dimensions = Dimensions(provider="nova_pay")
    dimension_key = "provider=nova_pay"
    anomaly = Anomaly(
        anomaly_id=f"anom_notification_{suffix}",
        detected_at=START + timedelta(minutes=3),
        dimension_key=dimension_key,
        window_start=START + timedelta(minutes=2),
        window_end=START + timedelta(minutes=3),
        observed_approval_rate=0.55,
        expected_approval_rate=0.9,
        persistence_windows=3,
        volume=120,
        severity=Severity.critical,
    )
    evidence = Evidence(
        evidence_id=f"ev_notification_{suffix}",
        source="baseline_comparison",
        summary="nova_pay: rechazo subió de 10% a 45%.",
        value=0.35,
        dimension_key=dimension_key,
    )
    candidate = IncidentCandidate(
        candidate_id=f"cand_notification_{suffix}",
        anomaly_id=anomaly.anomaly_id,
        dimensions=dimensions,
        confidence=0.93,
        affected_count=120,
        baseline_decline_rate=0.1,
        current_decline_rate=0.45,
        dominant_decline_code="provider_timeout",
        estimated_revenue_loss_usd_per_hour=12_000.0,
        rca_score=0.9,
        evidence_ids=[evidence.evidence_id],
    )
    return AnomalyDiagnosis(anomaly=anomaly, candidates=[candidate], evidence=[evidence])


def _window(*diagnoses: AnomalyDiagnosis) -> WindowResult:
    return WindowResult(
        window_start=START + timedelta(minutes=2),
        window_end=START + timedelta(minutes=3),
        diagnoses=list(diagnoses),
    )


def _service(
    pipeline: FakePipeline,
    notifications: RecordingNotificationSink,
) -> ControlTowerService:
    return ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=pipeline,
        notifications=notifications,
        start_at=START,
    )


def test_runtime_queues_one_notification_pair_after_a_direct_report() -> None:
    notifications = RecordingNotificationSink()
    service = _service(
        FakePipeline([_window(_diagnosis("first")), _window(_diagnosis("repeat"))]),
        notifications,
    )

    service.process_transaction(_transaction(0))
    service.process_transaction(_transaction(1))

    assert len(service.list_reports()) == 1
    assert len(notifications.calls) == 1
    incident_id, episode_key = notifications.calls[0]
    assert incident_id.startswith("inc_anom_notification_")
    assert len(episode_key) == 64


def test_notification_fault_never_blocks_a_published_report_or_health() -> None:
    notifications = RecordingNotificationSink(should_fail=True)
    service = _service(FakePipeline([_window(_diagnosis("failure"))]), notifications)

    service.process_transaction(_transaction(0))

    assert len(service.list_reports()) == 1
    assert len(notifications.calls) == 1
    assert service.health_status == "ok"


def test_healthy_window_creates_no_notification_job() -> None:
    notifications = RecordingNotificationSink()
    service = _service(FakePipeline([_window()]), notifications)

    service.process_transaction(_transaction(0))

    assert service.list_reports() == []
    assert notifications.calls == []
