from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from contracts.schemas import (
    Anomaly,
    ChaosMode,
    ChaosSpec,
    Dimensions,
    Evidence,
    IncidentCandidate,
    Severity,
)
from engine.api.assurance import completed_audit_view, evaluate_blind_trial, not_run_audit_view
from engine.investigator import AuditIssue, EvidenceAudit, run_investigation


START = datetime(2026, 8, 30, 15, 0, tzinfo=timezone.utc)


def _packet(diagnosed: Dimensions):
    anomaly = Anomaly(
        anomaly_id="anom_score",
        detected_at=START + timedelta(seconds=8),
        dimension_key="provider=nova_pay",
        window_start=START,
        window_end=START + timedelta(seconds=8),
        observed_approval_rate=0.59,
        expected_approval_rate=0.90,
        persistence_windows=3,
        volume=100,
        severity=Severity.high,
    )
    evidence = Evidence(
        evidence_id="ev_score",
        source="baseline_comparison",
        summary="Observed decline rate increased by 31 percentage points.",
        value=0.31,
        dimension_key="provider=nova_pay",
    )
    candidate = IncidentCandidate(
        candidate_id="cand_score",
        anomaly_id=anomaly.anomaly_id,
        dimensions=diagnosed,
        confidence=0.9,
        affected_count=100,
        baseline_decline_rate=0.1,
        current_decline_rate=0.41,
        estimated_revenue_loss_usd_per_hour=1_000,
        rca_score=0.9,
        evidence_ids=[evidence.evidence_id],
    )
    investigation = run_investigation(
        anomaly.anomaly_id,
        (candidate,),
        (evidence,),
    )
    return anomaly, candidate, investigation


@pytest.mark.parametrize(
    ("truth", "diagnosed", "expected"),
    [
        (
            Dimensions(provider="nova_pay", issuing_bank="nubank"),
            Dimensions(provider="nova_pay", issuing_bank="nubank"),
            "exact",
        ),
        (
            Dimensions(provider="nova_pay", issuing_bank="nubank"),
            Dimensions(provider="nova_pay"),
            "partial",
        ),
        (
            Dimensions(provider="nova_pay"),
            Dimensions(provider="nova_pay", payment_method="card"),
            "over_specific",
        ),
        (
            Dimensions(provider="nova_pay", issuing_bank="nubank"),
            Dimensions(provider="nova_pay", country="BR"),
            "mixed",
        ),
        (
            Dimensions(issuing_bank="nubank"),
            Dimensions(provider="nova_pay"),
            "incorrect",
        ),
        (
            Dimensions(provider="nova_pay"),
            Dimensions(provider="stripe"),
            "incorrect",
        ),
        (Dimensions(), Dimensions(), "exact"),
    ],
)
def test_blind_trial_dimension_outcomes_are_literal(
    truth: Dimensions,
    diagnosed: Dimensions,
    expected: str,
) -> None:
    anomaly, candidate, investigation = _packet(diagnosed)
    audit = not_run_audit_view(investigation)
    revealed = ChaosSpec(
        chaos_id="chaos_score",
        mode=ChaosMode.random_unknown,
        dimensions=truth,
        severity_pp=-35,
        started_at=START,
        duration_minutes=3,
        revealed=True,
    )

    evaluation = evaluate_blind_trial(
        revealed=revealed,
        incident_id=investigation.report.incident_id,
        anomaly=anomaly,
        report=investigation.report,
        candidates=(candidate,),
        evidence_audit=audit,
        publication_reason="published",
        ambiguous=False,
        detection_latency_seconds=8,
        explanation_latency_seconds=12.7,
    )

    assert evaluation.outcome == expected
    assert evaluation.estimated_degradation_pp == 31
    assert evaluation.severity_error_pp == 4
    assert evaluation.detection_latency_seconds == 8
    assert evaluation.explanation_latency_seconds == 12.7
    assert evaluation.investigation_latency_seconds == 4.7
    assert evaluation.evidence_audit_status == "not_run"
    assert evaluation.action_executed is False
    assert evaluation.human_review_required is True


def test_inconclusive_is_only_justified_with_a_stored_gate_reason() -> None:
    anomaly, candidate, investigation = _packet(Dimensions(provider="nova_pay"))
    fallback = run_investigation(anomaly.anomaly_id, (), ())
    revealed = ChaosSpec(
        chaos_id="chaos_inconclusive",
        mode=ChaosMode.random_unknown,
        dimensions=Dimensions(provider="nova_pay"),
        severity_pp=35,
        started_at=START,
        revealed=True,
    )

    justified = evaluate_blind_trial(
        revealed=revealed,
        incident_id=fallback.report.incident_id,
        anomaly=anomaly,
        report=fallback.report,
        candidates=(candidate,),
        evidence_audit=not_run_audit_view(fallback),
        publication_reason="insufficient_candidate_coverage",
        ambiguous=False,
        detection_latency_seconds=2,
        explanation_latency_seconds=3,
    )
    unverified = evaluate_blind_trial(
        revealed=revealed,
        incident_id=fallback.report.incident_id,
        anomaly=anomaly,
        report=fallback.report,
        candidates=(candidate,),
        evidence_audit=not_run_audit_view(fallback),
        publication_reason="investigator_inconclusive",
        ambiguous=False,
        detection_latency_seconds=2,
        explanation_latency_seconds=3,
    )
    approved_abstention_audit = completed_audit_view(
        EvidenceAudit(
            approved=True,
            summary="The independent audit accepted the explicit abstention.",
            issues=[],
        ),
        fallback,
    )
    verified_abstention = evaluate_blind_trial(
        revealed=revealed,
        incident_id=fallback.report.incident_id,
        anomaly=anomaly,
        report=fallback.report,
        candidates=(candidate,),
        evidence_audit=approved_abstention_audit,
        publication_reason="investigator_inconclusive",
        ambiguous=False,
        detection_latency_seconds=2,
        explanation_latency_seconds=3,
    )

    assert justified.outcome == "inconclusive"
    assert justified.abstention_assessment == "justified"
    assert unverified.abstention_assessment == "unverified"
    assert verified_abstention.abstention_assessment == "justified"


def test_no_report_and_ambiguous_remain_distinct() -> None:
    revealed = ChaosSpec(
        chaos_id="chaos_empty",
        mode=ChaosMode.random_unknown,
        dimensions=Dimensions(issuing_bank="nubank"),
        severity_pp=20,
        started_at=START,
        revealed=True,
    )
    common = dict(
        revealed=revealed,
        incident_id=None,
        anomaly=None,
        report=None,
        candidates=(),
        evidence_audit=None,
        publication_reason=None,
        detection_latency_seconds=None,
        explanation_latency_seconds=None,
    )

    no_report = evaluate_blind_trial(**common, ambiguous=False)
    ambiguous = evaluate_blind_trial(**common, ambiguous=True)

    assert no_report.outcome == "no_report"
    assert ambiguous.outcome == "ambiguous"
    assert no_report.truth_dimensions == {"issuing_bank": "nubank"}
    assert no_report.diagnosed_dimensions == {}


def test_api_boundary_rejects_audit_issues_with_unknown_references() -> None:
    _, _, investigation = _packet(Dimensions(provider="nova_pay"))
    unknown_claim = EvidenceAudit(
        approved=False,
        summary="Synthetic invalid audit.",
        issues=[
            AuditIssue(
                code="unsupported_claim",
                message="References data outside the audit packet.",
                claim_index=999,
                evidence_ids=["ev_not_consulted"],
            )
        ],
    )
    unknown_evidence = EvidenceAudit(
        approved=False,
        summary="Synthetic invalid audit.",
        issues=[
            AuditIssue(
                code="unsupported_claim",
                message="References data outside the audit packet.",
                claim_index=0,
                evidence_ids=["ev_not_consulted"],
            )
        ],
    )

    with pytest.raises(ValueError, match="unknown claim"):
        completed_audit_view(unknown_claim, investigation)
    with pytest.raises(ValueError, match="unconsulted evidence"):
        completed_audit_view(unknown_evidence, investigation)
