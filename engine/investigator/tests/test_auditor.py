from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from engine.investigator.auditor import (
    AuditIssue,
    EvidenceAudit,
    run_evidence_audit,
)
from engine.investigator.mock_data import clear_provider_country_case
from engine.investigator.runner import run_investigation
from engine.investigator.validation import ReportValidationError


class FakeAuditResponses:
    def __init__(self, audit: EvidenceAudit) -> None:
        self.audit = audit
        self.parse_requests: list[dict[str, Any]] = []

    def parse(self, **kwargs: Any) -> SimpleNamespace:
        self.parse_requests.append(kwargs)
        return SimpleNamespace(output_parsed=self.audit)


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
    packet = json.loads(responses.parse_requests[0]["input"][0]["content"])
    consulted_ids = {item["evidence_id"] for item in packet["consulted_evidence"]}
    assert "ev_clear_baseline" in consulted_ids
    assert "ev_country_baseline" not in consulted_ids


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
