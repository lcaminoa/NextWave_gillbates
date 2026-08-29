from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError

from engine.investigator.auditor import (
    AuditIssue,
    EvidenceAudit,
    EvidenceAuditError,
    run_evidence_audit,
)
from engine.investigator.mock_data import clear_provider_country_case
from engine.investigator.runner import InvestigationResult, run_investigation
from engine.investigator.validation import ReportValidationError


class FakeAuditResponses:
    def __init__(
        self,
        audit: EvidenceAudit | None = None,
        error: Exception | None = None,
    ) -> None:
        self.audit = audit
        self.error = error
        self.parse_requests: list[dict[str, Any]] = []

    def parse(self, **kwargs: Any) -> SimpleNamespace:
        self.parse_requests.append(kwargs)
        if self.error is not None:
            raise self.error
        return SimpleNamespace(output_parsed=self.audit)


def _run_with_audit(audit: EvidenceAudit) -> EvidenceAudit:
    case = clear_provider_country_case()
    investigation = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    return run_evidence_audit(
        investigation,
        case.candidates,
        case.evidence,
        model="test-model",
        client=SimpleNamespace(responses=FakeAuditResponses(audit)),
    )


def test_evidence_auditor_approves_supported_report() -> None:
    case = clear_provider_country_case()
    investigation = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    responses = FakeAuditResponses(
        EvidenceAudit(
            approved=True,
            summary="Las afirmaciones estan respaldadas por la evidencia consultada.",
            issues=[],
        )
    )

    audit = run_evidence_audit(
        investigation,
        case.candidates,
        case.evidence,
        model="test-model",
        client=SimpleNamespace(responses=responses),
    )

    assert audit.approved is True
    assert responses.parse_requests[0]["text_format"] is EvidenceAudit
    assert responses.parse_requests[0]["store"] is False
    assert "tools" not in responses.parse_requests[0]
    packet = json.loads(responses.parse_requests[0]["input"][0]["content"])
    consulted_ids = {item["evidence_id"] for item in packet["consulted_evidence"]}
    assert "ev_clear_baseline" in consulted_ids
    assert "ev_country_baseline" not in consulted_ids
    assert all("evidence_ids" not in item for item in packet["ranked_candidates"])
    assert all("counterfactual_check" not in item for item in packet["ranked_candidates"])


def test_evidence_auditor_can_reject_semantically_unsupported_claim() -> None:
    case = clear_provider_country_case()
    investigation = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    responses = FakeAuditResponses(
        EvidenceAudit(
            approved=False,
            summary="Una afirmacion excede la evidencia citada.",
            issues=[
                AuditIssue(
                    code="unsupported_claim",
                    message="La evidencia muestra correlacion, no una causa mecanica definitiva.",
                    claim_index=0,
                    evidence_ids=["ev_clear_baseline"],
                )
            ],
        )
    )

    audit = run_evidence_audit(
        investigation,
        case.candidates,
        case.evidence,
        model="test-model",
        client=SimpleNamespace(responses=responses),
    )

    assert audit.approved is False
    assert audit.issues[0].code == "unsupported_claim"


def test_evidence_auditor_rejects_unknown_evidence_reference() -> None:
    case = clear_provider_country_case()
    investigation = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    responses = FakeAuditResponses(
        EvidenceAudit(
            approved=False,
            summary="Reporte rechazado.",
            issues=[
                AuditIssue(
                    code="unsupported_claim",
                    message="Referencia una evidencia que no fue consultada.",
                    claim_index=0,
                    evidence_ids=["ev_not_consulted"],
                )
            ],
        )
    )

    with pytest.raises(ReportValidationError, match="unknown evidence"):
        run_evidence_audit(
            investigation,
            case.candidates,
            case.evidence,
            model="test-model",
            client=SimpleNamespace(responses=responses),
        )


def test_evidence_auditor_rejects_overstated_confidence() -> None:
    audit = _run_with_audit(
        EvidenceAudit(
            approved=False,
            summary="La certeza expresada excede la evidencia.",
            issues=[
                AuditIssue(
                    code="overstated_confidence",
                    message="El claim presenta la causa como definitiva.",
                    claim_index=0,
                    evidence_ids=["ev_clear_baseline"],
                )
            ],
        )
    )

    assert audit.approved is False
    assert audit.issues[0].code == "overstated_confidence"


def test_evidence_auditor_rejects_isolation_without_counterfactual() -> None:
    audit = _run_with_audit(
        EvidenceAudit(
            approved=False,
            summary="Falta evidencia para afirmar aislamiento.",
            issues=[
                AuditIssue(
                    code="missing_counterfactual",
                    message="El claim de aislamiento necesita un control comparable.",
                    claim_index=0,
                    evidence_ids=["ev_clear_baseline"],
                )
            ],
        )
    )

    assert audit.approved is False
    assert audit.issues[0].code == "missing_counterfactual"


def test_evidence_auditor_rejects_unsafe_or_executed_recommendation() -> None:
    audit = _run_with_audit(
        EvidenceAudit(
            approved=False,
            summary="La recomendacion excede el alcance permitido.",
            issues=[
                AuditIssue(
                    code="unsafe_recommendation",
                    message="La recomendacion se presenta como ya ejecutada y sin aprobacion.",
                    evidence_ids=[],
                )
            ],
        )
    )

    assert audit.approved is False
    assert audit.issues[0].code == "unsafe_recommendation"
    assert audit.issues[0].evidence_ids == []


@pytest.mark.parametrize(
    "issue",
    [
        AuditIssue(
            code="unsupported_claim",
            message="Referencia evidencia fuera del paquete.",
            claim_index=0,
            evidence_ids=["ev_not_in_packet"],
        ),
        AuditIssue(
            code="unsupported_claim",
            message="Referencia un claim inexistente.",
            claim_index=999,
            evidence_ids=["ev_clear_baseline"],
        ),
    ],
)
def test_evidence_auditor_rejects_invalid_issue_references(issue: AuditIssue) -> None:
    case = clear_provider_country_case()
    investigation = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    responses = FakeAuditResponses(
        EvidenceAudit(
            approved=False,
            summary="Salida invalida del Auditor.",
            issues=[issue],
        )
    )

    with pytest.raises(ReportValidationError):
        run_evidence_audit(
            investigation,
            case.candidates,
            case.evidence,
            model="test-model",
            client=SimpleNamespace(responses=responses),
        )


def test_evidence_auditor_fails_closed_when_openai_call_fails() -> None:
    case = clear_provider_country_case()
    investigation = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    responses = FakeAuditResponses(error=TimeoutError("upstream timeout"))

    with pytest.raises(EvidenceAuditError, match="must not be published") as exc_info:
        run_evidence_audit(
            investigation,
            case.candidates,
            case.evidence,
            model="test-model",
            client=SimpleNamespace(responses=responses),
        )

    assert isinstance(exc_info.value.__cause__, TimeoutError)
    assert responses.parse_requests


def test_deterministic_validator_runs_before_auditor_call() -> None:
    case = clear_provider_country_case()
    investigation = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    invalid_report = investigation.report.model_copy(
        update={"requires_human_review": False}
    )
    invalid_investigation = InvestigationResult(
        report=invalid_report,
        steps=investigation.steps,
        consulted_evidence_ids=investigation.consulted_evidence_ids,
        tool_calls=investigation.tool_calls,
    )
    responses = FakeAuditResponses(
        EvidenceAudit(
            approved=True,
            summary="No deberia llegar a ejecutarse.",
            issues=[],
        )
    )

    with pytest.raises(ReportValidationError, match="require human review"):
        run_evidence_audit(
            invalid_investigation,
            case.candidates,
            case.evidence,
            model="test-model",
            client=SimpleNamespace(responses=responses),
        )

    assert responses.parse_requests == []


@pytest.mark.parametrize(
    ("approved", "issues"),
    [
        (
            True,
            [
                AuditIssue(
                    code="other",
                    message="Una aprobacion no puede incluir issues.",
                )
            ],
        ),
        (False, []),
    ],
)
def test_evidence_audit_decision_must_match_issues(
    approved: bool,
    issues: list[AuditIssue],
) -> None:
    with pytest.raises(ValidationError):
        EvidenceAudit(
            approved=approved,
            summary="Decision estructuralmente inconsistente.",
            issues=issues,
        )
