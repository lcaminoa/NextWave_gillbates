from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import threading

from fastapi.testclient import TestClient
import pytest

from contracts.schemas import (
    Anomaly,
    Claim,
    ChaosMode,
    ChaosSpec,
    Dimensions,
    Evidence,
    IncidentCandidate,
    ReportStatus,
    Severity,
    Transaction,
)
from engine.api.runtime import ControlTowerService
from engine.detection.pipeline import AnomalyDiagnosis, DetectionPipeline, WindowResult
from engine.investigator import (
    AuditedInvestigationResult,
    AuditIssue,
    EvidenceAudit,
    EvidenceAuditError,
    run_investigation,
)
from engine.investigator.runner import InvestigationResult
from engine.main import create_app
from simulator import PaymentSimulator


START = datetime(2026, 8, 29, 14, 0, tzinfo=timezone.utc)


class FakePipeline:
    def __init__(self, results: list[WindowResult] | None = None) -> None:
        self.results = list(results or [])

    def ingest(self, _: Transaction) -> list[WindowResult]:
        return [self.results.pop(0)] if self.results else []

    def flush(self) -> WindowResult | None:
        return None


def _transaction(index: int = 0) -> Transaction:
    return Transaction(
        transaction_id=f"txn_api_{index}",
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


def _diagnosis(
    suffix: str,
    *,
    dimensions: Dimensions,
    dimension_key: str,
) -> AnomalyDiagnosis:
    anomaly_id = f"anom_{suffix}"
    evidence_id = f"ev_{suffix}"
    candidate = IncidentCandidate(
        candidate_id=f"cand_{suffix}",
        anomaly_id=anomaly_id,
        dimensions=dimensions,
        confidence=0.93,
        affected_count=120,
        baseline_decline_rate=0.1,
        current_decline_rate=0.45,
        dominant_decline_code="provider_timeout",
        estimated_revenue_loss_usd_per_hour=12_000.0,
        rca_score=0.9,
        evidence_ids=[evidence_id],
    )
    evidence = Evidence(
        evidence_id=evidence_id,
        source="baseline_comparison",
        summary=f"{dimension_key}: rechazo subio de 10% a 45%.",
        value=0.35,
        dimension_key=dimension_key,
    )
    anomaly = Anomaly(
        anomaly_id=anomaly_id,
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
    return AnomalyDiagnosis(anomaly=anomaly, candidates=[candidate], evidence=[evidence])


def _diagnosis_with_candidates(
    suffix: str,
    *,
    dimension_key: str,
    candidate_specs: list[tuple[Dimensions, float, float]],
) -> AnomalyDiagnosis:
    base = _diagnosis(
        suffix,
        dimensions=candidate_specs[0][0],
        dimension_key=dimension_key,
    )
    candidates: list[IncidentCandidate] = []
    evidence: list[Evidence] = []
    for index, (dimensions, rca_score, loss) in enumerate(candidate_specs):
        evidence_id = f"ev_{suffix}_{index}"
        dimension_text = "|".join(
            f"{key}={value}"
            for key, value in dimensions.model_dump(exclude_none=True).items()
        )
        evidence.append(
            Evidence(
                evidence_id=evidence_id,
                source="baseline_comparison",
                summary=f"{dimension_text}: rechazo subio de 10% a 45%.",
                value=0.35,
                dimension_key=dimension_text,
            )
        )
        candidates.append(
            base.candidates[0].model_copy(
                update={
                    "candidate_id": f"cand_{suffix}_{index}",
                    "dimensions": dimensions,
                    "estimated_revenue_loss_usd_per_hour": loss,
                    "rca_score": rca_score,
                    "evidence_ids": [evidence_id],
                }
            )
        )
    return AnomalyDiagnosis(
        anomaly=base.anomaly,
        candidates=candidates,
        evidence=evidence,
    )


def _window(*diagnoses: AnomalyDiagnosis) -> WindowResult:
    return WindowResult(
        window_start=START + timedelta(minutes=2),
        window_end=START + timedelta(minutes=3),
        diagnoses=list(diagnoses),
    )


def _service(*results: WindowResult) -> ControlTowerService:
    return ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline(list(results)),
        start_at=START,
    )


def test_health_and_frozen_routes_are_exposed() -> None:
    app = create_app(_service(), start_background=False)
    with TestClient(app) as client:
        response = client.get("/api/health")
        schema = client.get("/openapi.json").json()

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert {
        "/api/health",
        "/api/stream",
        "/api/incidents",
        "/api/incidents/{incident_id}",
        "/api/chaos/inject",
        "/api/chaos/random",
        "/api/chaos/reveal",
    } <= set(schema["paths"])


def test_audited_openai_mode_is_explicit_and_requires_a_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_TOWER_INVESTIGATOR_MODE", "audited_openai")
    monkeypatch.delenv("OPENAI_MODEL", raising=False)

    with pytest.raises(RuntimeError, match="requires OPENAI_MODEL"):
        create_app(start_background=False)

    captured: dict[str, object] = {}

    def fake_audited_run(anomaly, candidates, evidence, **kwargs):
        captured.update(kwargs)
        investigation = run_investigation(
            anomaly.anomaly_id,
            tuple(candidates),
            tuple(evidence),
        )
        return AuditedInvestigationResult(
            investigation=investigation,
            audit=EvidenceAudit(
                approved=True,
                summary="Reporte aprobado por el mock.",
                issues=[],
            ),
        )

    monkeypatch.setattr("engine.main.run_audited_openai_investigation", fake_audited_run)
    monkeypatch.setenv("OPENAI_MODEL", "mock-investigator")
    monkeypatch.setenv("OPENAI_AUDITOR_MODEL", "mock-auditor")
    monkeypatch.setenv("OPENAI_REQUEST_TIMEOUT_SECONDS", "7.5")
    app = create_app(start_background=False)
    diagnosis = _diagnosis(
        "configured_audit",
        dimensions=Dimensions(provider="nova_pay"),
        dimension_key="provider=nova_pay",
    )

    audited = app.state.control_tower.audited_investigator(
        diagnosis.anomaly,
        diagnosis.candidates,
        diagnosis.evidence,
    )

    assert app.state.control_tower.audited_investigator is not None
    assert audited.audit.approved is True
    assert captured == {
        "model": "mock-investigator",
        "auditor_model": "mock-auditor",
        "request_timeout_seconds": 7.5,
    }


def test_audited_openai_mode_rejects_invalid_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_TOWER_INVESTIGATOR_MODE", "audited_openai")
    monkeypatch.setenv("OPENAI_MODEL", "mock-model")
    monkeypatch.setenv("OPENAI_REQUEST_TIMEOUT_SECONDS", "0")

    with pytest.raises(RuntimeError, match="must be a positive number"):
        create_app(start_background=False)


def test_random_chaos_is_opaque_until_reveal() -> None:
    service = _service()
    app = create_app(service, start_background=False)

    with TestClient(app) as client:
        hidden_response = client.post(
            "/api/chaos/random",
            json={"severity_pp": 35, "duration_minutes": 3},
        )
        hidden = hidden_response.json()
        reveal_response = client.post(
            "/api/chaos/reveal",
            json={"chaos_id": hidden["chaos_id"]},
        )

    assert hidden_response.status_code == 200
    assert hidden["mode"] == "random_unknown"
    assert hidden["revealed"] is False
    assert hidden["dimensions"] is None

    assert reveal_response.status_code == 200
    revealed = reveal_response.json()
    assert revealed["chaos_id"] == hidden["chaos_id"]
    assert revealed["revealed"] is True
    assert revealed["dimensions"]
    for secret_value in revealed["dimensions"].values():
        if secret_value is not None:
            assert f'"{secret_value}"' not in hidden_response.text


def test_manual_chaos_is_injected_at_the_live_simulator_clock() -> None:
    service = _service()
    app = create_app(service, start_background=False)
    requested = ChaosSpec(
        chaos_id="chaos_manual_api",
        mode=ChaosMode.manual,
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        severity_pp=35,
        started_at=START - timedelta(hours=3),
        duration_minutes=3,
        revealed=False,
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/chaos/inject",
            json=requested.model_dump(mode="json"),
        )

    assert response.status_code == 200
    injected = ChaosSpec.model_validate(response.json())
    assert injected.mode is ChaosMode.manual
    assert injected.revealed is True
    assert injected.started_at == START
    assert injected.dimensions == requested.dimensions


def test_chaos_routes_reject_unsafe_limits_duplicates_and_missing_judge_key() -> None:
    service = _service()
    app = create_app(service, start_background=False, judge_token="judge-secret")
    manual = ChaosSpec(
        chaos_id="chaos_protected",
        mode=ChaosMode.manual,
        dimensions=Dimensions(provider="nova_pay"),
        severity_pp=35,
        started_at=START,
        duration_minutes=3,
        revealed=True,
    ).model_dump(mode="json")

    with TestClient(app) as client:
        assert client.post("/api/chaos/inject", json=manual).status_code == 403
        headers = {"X-Control-Tower-Judge-Key": "judge-secret"}
        assert client.post(
            "/api/chaos/random",
            json={"severity_pp": 35, "duration_minutes": 61},
            headers=headers,
        ).status_code == 422
        assert client.post("/api/chaos/inject", json=manual, headers=headers).status_code == 200
        duplicate = client.post("/api/chaos/inject", json=manual, headers=headers)

    assert duplicate.status_code == 422
    assert duplicate.json()["detail"] == "chaos_id already exists"


def test_public_mode_refuses_to_start_without_a_strong_judge_key() -> None:
    with pytest.raises(RuntimeError, match="at least 16 characters"):
        create_app(
            _service(),
            start_background=False,
            judge_token="short",
            public_mode=True,
        )


def test_sse_replays_contract_valid_transactions_without_chaos_metadata() -> None:
    service = _service()
    expected = [_transaction(index) for index in range(3)]
    for transaction in expected:
        service.broker.publish(transaction)
    service.broker.close()
    app = create_app(service, start_background=False)

    with TestClient(app) as client:
        response = client.get("/api/stream")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    frames = [frame for frame in response.text.split("\n\n") if frame]
    payloads = [
        next(line.removeprefix("data: ") for line in frame.splitlines() if line.startswith("data: "))
        for frame in frames
    ]
    transactions = [Transaction.model_validate_json(payload) for payload in payloads]
    assert [item.transaction_id for item in transactions] == [item.transaction_id for item in expected]
    assert [item.timestamp for item in transactions] == sorted(item.timestamp for item in transactions)
    assert "chaos_id" not in response.text
    assert "severity_pp" not in response.text
    assert "revealed" not in response.text


def test_sse_reconnect_resumes_after_last_event_id() -> None:
    service = _service()
    expected = [_transaction(index) for index in range(3)]
    for transaction in expected:
        service.broker.publish(transaction)
    service.broker.close()
    app = create_app(service, start_background=False)

    with TestClient(app) as client:
        response = client.get(
            "/api/stream",
            headers={"Last-Event-ID": expected[1].transaction_id},
        )

    payloads = [
        line.removeprefix("data: ")
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]
    assert [Transaction.model_validate_json(payload).transaction_id for payload in payloads] == [
        expected[2].transaction_id
    ]


def test_simultaneous_diagnoses_remain_separate_through_the_api() -> None:
    nova = _diagnosis(
        "nova_br",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )
    stripe = _diagnosis(
        "stripe_mx",
        dimensions=Dimensions(provider="stripe", country="MX"),
        dimension_key="country=MX|provider=stripe",
    )
    service = _service(_window(nova, stripe))
    service.process_transaction(_transaction())
    nova_detail = service.get_incident("inc_anom_nova_br")
    assert nova_detail is not None
    assert nova_detail.report.generated_at >= nova.anomaly.detected_at
    assert all(
        step.timestamp >= nova.anomaly.detected_at
        for step in nova_detail.investigation_steps
    )
    app = create_app(service, start_background=False)

    with TestClient(app) as client:
        reports_response = client.get("/api/incidents")
        reports = reports_response.json()
        details = [
            client.get(f"/api/incidents/{report['incident_id']}").json()
            for report in reports
        ]
        missing = client.get("/api/incidents/inc_missing")

    assert reports_response.status_code == 200
    assert len(reports) == 2
    assert missing.status_code == 404
    assert {
        tuple(sorted(detail["candidates"][0]["dimensions"].items()))
        for detail in details
    } == {
        tuple(sorted(nova.candidates[0].dimensions.model_dump(mode="json").items())),
        tuple(sorted(stripe.candidates[0].dimensions.model_dump(mode="json").items())),
    }
    for detail in details:
        candidate_ids = {item["candidate_id"] for item in detail["candidates"]}
        evidence_ids = {item["evidence_id"] for item in detail["evidence"]}
        assert detail["report"]["winning_candidate_id"] in candidate_ids
        assert all(
            evidence_id in evidence_ids
            for claim in detail["report"]["claims"]
            for evidence_id in claim["evidence_ids"]
        )


def test_persistent_segment_is_investigated_once_until_a_healthy_window() -> None:
    first = _diagnosis(
        "episode_1",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )
    repeated = _diagnosis(
        "episode_2",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )
    recurrence = _diagnosis(
        "episode_3",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )
    calls: list[str] = []

    def investigator(anomaly_id, candidates, evidence):
        calls.append(anomaly_id)
        return run_investigation(anomaly_id, tuple(candidates), tuple(evidence))

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline(
            [_window(first), _window(repeated), _window(), _window(), _window(recurrence)]
        ),
        investigator=investigator,
        start_at=START,
    )

    service.process_transaction(_transaction(0))
    service.process_transaction(_transaction(1))
    assert len(service.list_reports()) == 1
    assert calls == ["anom_episode_1"]

    service.process_transaction(_transaction(2))
    service.process_transaction(_transaction(3))
    service.process_transaction(_transaction(4))
    assert len(service.list_reports()) == 2
    assert calls == ["anom_episode_1", "anom_episode_3"]


def test_hierarchical_episode_survives_a_single_symptom_window() -> None:
    provider_first = _diagnosis_with_candidates(
        "provider_first",
        dimension_key="provider=nova_pay",
        candidate_specs=[
            (Dimensions(provider="nova_pay"), 0.9, 20_000),
            (Dimensions(provider="nova_pay", country="BR"), 0.5, 10_000),
        ],
    )
    country_first = _diagnosis_with_candidates(
        "country_first",
        dimension_key="country=BR",
        candidate_specs=[
            (Dimensions(provider="nova_pay", country="BR"), 0.85, 15_000),
            (Dimensions(country="BR"), 0.4, 8_000),
        ],
    )
    provider_second = _diagnosis_with_candidates(
        "provider_second",
        dimension_key="provider=nova_pay",
        candidate_specs=[
            (Dimensions(provider="nova_pay", country="BR"), 0.95, 22_000),
            (Dimensions(provider="nova_pay"), 0.8, 18_000),
        ],
    )
    calls: list[str] = []

    def investigator(anomaly_id, candidates, evidence):
        calls.append(anomaly_id)
        return run_investigation(anomaly_id, tuple(candidates), tuple(evidence))

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline(
            [
                _window(provider_first, country_first),
                _window(provider_second),
            ]
        ),
        investigator=investigator,
        start_at=START,
    )

    service.process_transaction(_transaction(0))
    service.process_transaction(_transaction(1))

    assert len(service.list_reports()) == 1
    assert calls == ["anom_provider_first"]


def test_provisional_episode_is_replaced_when_unique_direct_anchor_arrives() -> None:
    country_before_anchor = _diagnosis_with_candidates(
        "country_before_anchor",
        dimension_key="country=BR",
        candidate_specs=[
            (Dimensions(provider="nova_pay", country="BR"), 0.9, 20_000),
            (Dimensions(country="BR"), 0.4, 8_000),
        ],
    )
    provider_anchor = _diagnosis_with_candidates(
        "provider_anchor_later",
        dimension_key="provider=nova_pay",
        candidate_specs=[
            (Dimensions(provider="nova_pay"), 0.9, 30_000),
            (Dimensions(provider="nova_pay", country="BR"), 0.5, 20_000),
        ],
    )
    country_satellite = _diagnosis_with_candidates(
        "country_satellite_later",
        dimension_key="country=BR",
        candidate_specs=[
            (Dimensions(provider="nova_pay", country="BR"), 0.9, 20_000),
            (Dimensions(country="BR"), 0.4, 8_000),
        ],
    )
    calls: list[str] = []

    def investigator(anomaly_id, candidates, evidence):
        calls.append(anomaly_id)
        return run_investigation(anomaly_id, tuple(candidates), tuple(evidence))

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline(
            [
                _window(country_before_anchor),
                _window(provider_anchor, country_satellite),
            ]
        ),
        investigator=investigator,
        start_at=START,
    )

    service.process_transaction(_transaction(0))
    [provisional] = service.list_reports()
    assert provisional.anomaly_id == "anom_country_before_anchor"

    service.process_transaction(_transaction(1))

    [promoted] = service.list_reports()
    assert promoted.anomaly_id == "anom_provider_anchor_later"
    assert calls == ["anom_country_before_anchor", "anom_provider_anchor_later"]


def test_cross_candidate_does_not_merge_two_direct_incidents() -> None:
    provider = _diagnosis_with_candidates(
        "direct_provider",
        dimension_key="provider=nova_pay",
        candidate_specs=[
            (Dimensions(provider="nova_pay"), 0.9, 20_000),
            (Dimensions(provider="nova_pay", country="BR"), 0.2, 4_000),
        ],
    )
    country = _diagnosis_with_candidates(
        "direct_country",
        dimension_key="country=BR",
        candidate_specs=[
            (Dimensions(country="BR"), 0.9, 18_000),
            (Dimensions(provider="nova_pay", country="BR"), 0.2, 4_000),
        ],
    )
    service = _service(_window(provider, country))

    service.process_transaction(_transaction())

    assert {report.anomaly_id for report in service.list_reports()} == {
        "anom_direct_provider",
        "anom_direct_country",
    }


def test_shared_provisional_candidate_does_not_prove_one_incident() -> None:
    provider = _diagnosis_with_candidates(
        "provisional_provider",
        dimension_key="provider=nova_pay",
        candidate_specs=[
            (Dimensions(provider="nova_pay", country="BR"), 0.9, 20_000),
            (Dimensions(provider="nova_pay"), 0.4, 8_000),
        ],
    )
    country = _diagnosis_with_candidates(
        "provisional_country",
        dimension_key="country=BR",
        candidate_specs=[
            (Dimensions(provider="nova_pay", country="BR"), 0.9, 20_000),
            (Dimensions(country="BR"), 0.4, 8_000),
        ],
    )
    service = _service(_window(provider, country))

    service.process_transaction(_transaction())

    assert {report.anomaly_id for report in service.list_reports()} == {
        "anom_provisional_provider",
        "anom_provisional_country",
    }


def test_broad_projection_does_not_merge_or_duplicate_two_active_episodes() -> None:
    br = _diagnosis_with_candidates(
        "specific_br",
        dimension_key="country=BR|provider=nova_pay",
        candidate_specs=[
            (Dimensions(provider="nova_pay", country="BR"), 0.9, 20_000),
        ],
    )
    mx = _diagnosis_with_candidates(
        "specific_mx",
        dimension_key="country=MX|provider=nova_pay",
        candidate_specs=[
            (Dimensions(provider="nova_pay", country="MX"), 0.9, 18_000),
        ],
    )
    broad = _diagnosis_with_candidates(
        "broad_provider",
        dimension_key="provider=nova_pay",
        candidate_specs=[
            (Dimensions(provider="nova_pay"), 0.9, 30_000),
        ],
    )
    broad_repeated = _diagnosis_with_candidates(
        "broad_provider_repeated",
        dimension_key="provider=nova_pay",
        candidate_specs=[
            (Dimensions(provider="nova_pay"), 0.9, 30_000),
        ],
    )
    calls: list[str] = []

    def investigator(anomaly_id, candidates, evidence):
        calls.append(anomaly_id)
        return run_investigation(anomaly_id, tuple(candidates), tuple(evidence))

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline(
            [_window(br, mx), _window(broad), _window(broad_repeated)]
        ),
        investigator=investigator,
        start_at=START,
    )

    service.process_transaction(_transaction(0))
    initial_ids = {report.incident_id for report in service.list_reports()}
    service.process_transaction(_transaction(1))

    assert {report.incident_id for report in service.list_reports()} == initial_ids
    assert calls == ["anom_specific_br", "anom_specific_mx"]

    service.process_transaction(_transaction(2))

    assert len(service.list_reports()) == 3
    assert calls == [
        "anom_specific_br",
        "anom_specific_mx",
        "anom_broad_provider_repeated",
    ]


def test_transient_investigator_failure_is_retried_without_duplicate_report() -> None:
    first = _diagnosis(
        "retry_1",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )
    second = _diagnosis(
        "retry_2",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )
    calls: list[str] = []

    def flaky_investigator(anomaly_id, candidates, evidence):
        calls.append(anomaly_id)
        if len(calls) == 1:
            raise RuntimeError("temporary OpenAI failure")
        return run_investigation(anomaly_id, tuple(candidates), tuple(evidence))

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline([_window(first), _window(second)]),
        investigator=flaky_investigator,
        start_at=START,
    )
    service.process_transaction(_transaction(0))
    [fallback] = service.list_reports()
    assert fallback.status is ReportStatus.inconclusive

    service.process_transaction(_transaction(1))
    [recovered] = service.list_reports()
    assert calls == ["anom_retry_1", "anom_retry_2"]
    assert recovered.anomaly_id == "anom_retry_2"
    assert recovered.status is ReportStatus.confirmed


def test_audited_runtime_rejection_fails_closed_and_retries_without_duplicate() -> None:
    first = _diagnosis(
        "audit_retry_1",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )
    second = _diagnosis(
        "audit_retry_2",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )
    calls: list[str] = []

    def audited_investigator(anomaly, candidates, evidence):
        calls.append(anomaly.anomaly_id)
        investigation = run_investigation(
            anomaly.anomaly_id,
            tuple(candidates),
            tuple(evidence),
        )
        if len(calls) == 1:
            audit = EvidenceAudit(
                approved=False,
                summary="La especificidad no esta suficientemente respaldada.",
                issues=[
                    AuditIssue(
                        code="missing_counterfactual",
                        message="Falta aislar una dimension adicional.",
                    )
                ],
            )
        else:
            audit = EvidenceAudit(
                approved=True,
                summary="El reporte puede publicarse.",
                issues=[],
            )
        return AuditedInvestigationResult(investigation=investigation, audit=audit)

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline([_window(first), _window(second)]),
        audited_investigator=audited_investigator,
        start_at=START,
    )

    service.process_transaction(_transaction(0))
    [fallback] = service.list_reports()
    assert fallback.status is ReportStatus.inconclusive
    assert fallback.winning_candidate_id is None

    service.process_transaction(_transaction(1))
    [recovered] = service.list_reports()
    assert calls == ["anom_audit_retry_1", "anom_audit_retry_2"]
    assert recovered.anomaly_id == "anom_audit_retry_2"
    assert recovered.status is ReportStatus.confirmed


@pytest.mark.parametrize(
    "error_type",
    [EvidenceAuditError, TimeoutError],
    ids=["audit_error", "audit_timeout"],
)
def test_audited_runtime_error_never_publishes_an_unaudited_winner(
    error_type: type[Exception],
) -> None:
    diagnosis = _diagnosis(
        "audit_failure",
        dimensions=Dimensions(provider="nova_pay"),
        dimension_key="provider=nova_pay",
    )

    def failing_auditor(anomaly, candidates, evidence):
        raise error_type("synthetic audit failure")

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline([_window(diagnosis)]),
        audited_investigator=failing_auditor,
        start_at=START,
    )
    service.process_transaction(_transaction())

    [report] = service.list_reports()
    assert report.status is ReportStatus.inconclusive
    assert report.winning_candidate_id is None
    assert report.claims == []


def test_api_runtime_does_not_publish_an_unproven_extra_dimension() -> None:
    base = _diagnosis(
        "merchant_specificity",
        dimensions=Dimensions(merchant="Comercio2"),
        dimension_key="merchant=Comercio2",
    )
    simple = base.candidates[0].model_copy(
        update={
            "candidate_id": "cand_merchant",
            "dimensions": Dimensions(merchant="Comercio2"),
            "confidence": 0.91,
            "current_decline_rate": 0.48,
            "rca_score": 0.80,
            "evidence_ids": ["ev_merchant"],
        }
    )
    specific = base.candidates[0].model_copy(
        update={
            "candidate_id": "cand_merchant_stripe",
            "dimensions": Dimensions(merchant="Comercio2", provider="stripe"),
            "confidence": 0.94,
            "current_decline_rate": 0.49,
            "rca_score": 0.95,
            "evidence_ids": ["ev_merchant_stripe", "ev_provider_control"],
            "counterfactual_check": "Se compararon providers dentro del merchant.",
        }
    )
    evidence = [
        Evidence(
            evidence_id="ev_merchant",
            source="baseline_comparison",
            summary="Comercio2: rechazo subio de 10% a 48%.",
            value=0.38,
            dimension_key="merchant=Comercio2",
        ),
        Evidence(
            evidence_id="ev_merchant_stripe",
            source="baseline_comparison",
            summary="Comercio2 con stripe: rechazo subio de 10% a 49%.",
            value=0.39,
            dimension_key="merchant=Comercio2|provider=stripe",
        ),
        Evidence(
            evidence_id="ev_provider_control",
            source="counterfactual_provider",
            summary="Otro provider del merchant tiene un desempeno comparable.",
            value=0.50,
            dimension_key="merchant=Comercio2|provider=stripe",
        ),
    ]
    diagnosis = AnomalyDiagnosis(
        anomaly=base.anomaly,
        candidates=[specific, simple],
        evidence=evidence,
    )
    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline([_window(diagnosis)]),
        start_at=START,
    )

    service.process_transaction(_transaction())

    [report] = service.list_reports()
    assert report.winning_candidate_id == "cand_merchant"
    assert "provider=stripe" not in report.summary


def test_invalid_investigator_output_fails_closed_before_publication() -> None:
    diagnosis = _diagnosis(
        "invalid_agent",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )

    def invalid_investigator(anomaly_id, candidates, evidence):
        valid = run_investigation(anomaly_id, tuple(candidates), tuple(evidence))
        invalid_report = valid.report.model_copy(
            update={
                "claims": [
                    Claim(
                        claim="Afirmacion que no tiene respaldo en el paquete.",
                        evidence_ids=["ev_not_in_packet"],
                        confidence=0.99,
                    )
                ]
            }
        )
        return InvestigationResult(
            report=invalid_report,
            steps=valid.steps,
            consulted_evidence_ids=valid.consulted_evidence_ids,
            tool_calls=valid.tool_calls,
        )

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline([_window(diagnosis)]),
        investigator=invalid_investigator,
        start_at=START,
    )
    service.process_transaction(_transaction())

    [report] = service.list_reports()
    assert report.status is ReportStatus.inconclusive
    assert report.winning_candidate_id is None
    assert report.claims == []


def test_health_degrades_if_the_single_producer_stops_unexpectedly() -> None:
    class FailingPipeline(FakePipeline):
        def ingest(self, _: Transaction) -> list[WindowResult]:
            raise OverflowError("synthetic producer failure")

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FailingPipeline(),
        start_at=START,
        emit_delay_seconds=0,
    )

    async def exercise() -> None:
        await service.start()
        for _ in range(50):
            if service.health_status == "degraded":
                break
            await asyncio.sleep(0.01)
        assert service.health_status == "degraded"
        await service.stop()

    asyncio.run(exercise())
    app = create_app(service, start_background=False)
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded"}


@pytest.mark.parametrize("audited_mode", [False, True], ids=["deterministic", "audited"])
def test_slow_investigator_runs_off_the_stream_event_loop(
    audited_mode: bool,
) -> None:
    diagnosis = _diagnosis(
        "slow_worker",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|provider=nova_pay",
    )
    started = threading.Event()
    release = threading.Event()

    def slow_investigator(anomaly_id, candidates, evidence):
        started.set()
        if not release.wait(timeout=2):
            raise TimeoutError("test did not release investigator")
        return run_investigation(anomaly_id, tuple(candidates), tuple(evidence))

    def slow_audited_investigator(anomaly, candidates, evidence):
        investigation = slow_investigator(anomaly.anomaly_id, candidates, evidence)
        return AuditedInvestigationResult(
            investigation=investigation,
            audit=EvidenceAudit(
                approved=True,
                summary="El mock aprobo el reporte.",
                issues=[],
            ),
        )

    investigator_config = (
        {"audited_investigator": slow_audited_investigator}
        if audited_mode
        else {"investigator": slow_investigator}
    )

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline([_window(diagnosis)]),
        start_at=START,
        emit_delay_seconds=0.001,
        **investigator_config,
    )

    async def exercise() -> None:
        await service.start()
        try:
            assert await asyncio.to_thread(started.wait, 1)
            timestamp_while_investigating = service.current_timestamp
            await asyncio.sleep(0.02)
            assert service.current_timestamp > timestamp_while_investigating
            release.set()
            for _ in range(50):
                if service.list_reports():
                    break
                await asyncio.sleep(0.01)
            assert len(service.list_reports()) == 1
        finally:
            release.set()
            await service.stop()

    asyncio.run(exercise())


def test_slow_detection_window_runs_off_the_api_event_loop() -> None:
    started = threading.Event()
    release = threading.Event()

    class SlowPipeline(FakePipeline):
        def ingest(self, _: Transaction) -> list[WindowResult]:
            started.set()
            if not release.wait(timeout=2):
                raise TimeoutError("test did not release detection")
            return []

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=SlowPipeline(),
        start_at=START,
        emit_delay_seconds=0.001,
    )

    async def exercise() -> None:
        await service.start()
        try:
            assert await asyncio.to_thread(started.wait, 1)
            await asyncio.wait_for(asyncio.sleep(0.01), timeout=0.1)
            assert service.health_status == "ok"
        finally:
            release.set()
            await service.stop()

    asyncio.run(exercise())


def test_unsupported_three_dimension_anomaly_fails_closed() -> None:
    diagnosis = _diagnosis(
        "three_dimensional",
        dimensions=Dimensions(provider="nova_pay", country="BR"),
        dimension_key="country=BR|payment_method=card|provider=nova_pay",
    )
    calls: list[str] = []

    def investigator(anomaly_id, candidates, evidence):
        calls.append(anomaly_id)
        return run_investigation(anomaly_id, tuple(candidates), tuple(evidence))

    service = ControlTowerService(
        simulator=PaymentSimulator(seed=42),
        pipeline=FakePipeline([_window(diagnosis)]),
        investigator=investigator,
        start_at=START,
    )
    service.process_transaction(_transaction())

    [report] = service.list_reports()
    detail = service.get_incident(report.incident_id)
    assert calls == []
    assert report.status is ReportStatus.inconclusive
    assert report.winning_candidate_id is None
    assert report.claims == []
    assert report.requires_human_review is True
    assert detail is not None
    assert [item.candidate_id for item in detail.candidates] == ["cand_three_dimensional"]


def test_real_simulator_pipeline_and_investigator_reach_incident_api() -> None:
    history = PaymentSimulator(seed=100).generate(
        START - timedelta(hours=1), count=1_500, interval_seconds=0.2
    )
    live = PaymentSimulator(seed=200)
    live.chaos.inject_manual(
        Dimensions(provider="nova_pay", country="BR"),
        severity_pp=35,
        started_at=START,
        duration_minutes=4,
    )
    service = ControlTowerService(
        simulator=live,
        pipeline=DetectionPipeline(history=history),
        start_at=START,
    )
    for transaction in live.generate(START, count=2_400, interval_seconds=0.1):
        service.process_transaction(transaction)

    app = create_app(service, start_background=False)
    with TestClient(app) as client:
        reports = client.get("/api/incidents").json()
        details = [
            client.get(f"/api/incidents/{report['incident_id']}").json()
            for report in reports
        ]

    assert reports
    assert len(reports) == 1
    matching = [
        detail
        for detail in details
        if any(
            candidate["dimensions"]["provider"] == "nova_pay"
            and candidate["dimensions"]["country"] == "BR"
            for candidate in detail["candidates"]
        )
    ]
    assert matching
    assert all(
        detail["report"]["status"] in {"confirmed", "probable", "inconclusive"}
        and detail["report"]["requires_human_review"] is True
        for detail in matching
    )
    assert all(
        evidence_id in {item["evidence_id"] for item in detail["evidence"]}
        for detail in matching
        for claim in detail["report"]["claims"]
        for evidence_id in claim["evidence_ids"]
    )
