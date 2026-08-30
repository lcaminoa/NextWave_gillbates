"""API-local assurance views for audits and post-reveal blind-trial scoring.

Nothing in this module is part of the eight shared contract entities.  The blind evaluator is
pure and receives ground truth only after the runtime has completed ``ChaosInjector.reveal``.
"""

from __future__ import annotations

from collections.abc import Collection
from typing import Literal

from contracts.schemas import Anomaly, ChaosSpec, IncidentCandidate, IncidentReport, ReportStatus
from engine.api.models import (
    BlindTrialEvaluation,
    DimensionConflict,
    EvidenceAuditCheck,
    EvidenceAuditView,
)
from engine.investigator import EvidenceAudit, InvestigationResult


PublicationReason = Literal[
    "published",
    "investigator_inconclusive",
    "insufficient_candidate_coverage",
    "unproven_winner",
    "investigation_error",
    "audit_rejected",
    "audit_error",
]

JUSTIFIED_ABSTENTION_REASONS: frozenset[PublicationReason] = frozenset(
    {
        "insufficient_candidate_coverage",
        "unproven_winner",
        "investigation_error",
        "audit_rejected",
        "audit_error",
    }
)


def _check(
    code: str,
    label: str,
    status: Literal["pass", "fail", "not_applicable"],
    detail: str,
) -> EvidenceAuditCheck:
    return EvidenceAuditCheck(code=code, label=label, status=status, detail=detail)


def not_run_audit_view(
    investigation: InvestigationResult,
    *,
    summary: str = (
        "Deterministic publication checks passed; the independent semantic auditor was not run."
    ),
) -> EvidenceAuditView:
    return EvidenceAuditView(
        status="not_run",
        summary=summary,
        issues=[],
        claims_reviewed=len(investigation.report.claims),
        evidence_reviewed=len(investigation.consulted_evidence_ids),
        requires_human_review=True,
        action_executed=False,
        checks=[
            _check(
                "deterministic_validation",
                "Deterministic validation",
                "pass",
                (
                    "Report structure, claim references and publication invariants were "
                    "validated locally."
                ),
            ),
            _check(
                "semantic_evidence_support",
                "Semantic evidence support",
                "not_applicable",
                "No independent semantic audit was executed for this report.",
            ),
            _check(
                "independent_auditor",
                "Independent auditor",
                "not_applicable",
                "The runtime used deterministic investigator mode.",
            ),
            _check(
                "human_review",
                "Human review",
                "pass",
                "The report remains a recommendation for human review.",
            ),
            _check(
                "no_action_executed",
                "No action executed",
                "pass",
                "PHAROS did not change routing or payment traffic.",
            ),
        ],
    )


def completed_audit_view(
    audit: EvidenceAudit,
    investigation: InvestigationResult,
) -> EvidenceAuditView:
    consulted_ids = set(investigation.consulted_evidence_ids)
    for index, issue in enumerate(audit.issues):
        if issue.claim_index is not None and issue.claim_index >= len(
            investigation.report.claims
        ):
            raise ValueError(f"audit issue[{index}] references an unknown claim")
        unknown_ids = set(issue.evidence_ids) - consulted_ids
        if unknown_ids:
            raise ValueError(
                f"audit issue[{index}] references unconsulted evidence: "
                + ", ".join(sorted(unknown_ids))
            )

    issue_codes = {issue.code for issue in audit.issues}
    approved = audit.approved

    semantic_failed = bool(
        issue_codes
        & {"unsupported_claim", "overstated_confidence", "inconsistent_report", "other"}
    )
    counterfactual_failed = "missing_counterfactual" in issue_codes
    recommendation_failed = "unsafe_recommendation" in issue_codes
    has_winner = investigation.report.winning_candidate_id is not None

    return EvidenceAuditView(
        status="approved" if approved else "rejected",
        summary=audit.summary,
        issues=audit.issues,
        claims_reviewed=len(investigation.report.claims),
        evidence_reviewed=len(investigation.consulted_evidence_ids),
        requires_human_review=True,
        action_executed=False,
        checks=[
            _check(
                "deterministic_validation",
                "Deterministic validation",
                "pass",
                "The draft passed structural validation before independent review.",
            ),
            _check(
                "semantic_evidence_support",
                "Claims backed by evidence",
                "pass" if approved else ("fail" if semantic_failed else "not_applicable"),
                (
                    "The independent auditor accepted the wording and cited evidence."
                    if approved
                    else "The audit identified semantic or consistency issues."
                    if semantic_failed
                    else "No separate semantic-claim failure was recorded."
                ),
            ),
            _check(
                "counterfactual_isolation",
                "Counterfactual isolation",
                (
                    "pass"
                    if approved and has_winner
                    else "fail"
                    if counterfactual_failed
                    else "not_applicable"
                ),
                (
                    "Required isolation controls were accepted by the auditor."
                    if approved and has_winner
                    else "A required healthy control or counterfactual was missing."
                    if counterfactual_failed
                    else "No asserted winner required a separate isolation check."
                ),
            ),
            _check(
                "proportional_recommendation",
                "Proportional recommendation",
                "pass" if approved else ("fail" if recommendation_failed else "not_applicable"),
                (
                    "The auditor accepted the recommendation as scoped and non-executing."
                    if approved
                    else "The recommendation exceeded the evidence or safety boundary."
                    if recommendation_failed
                    else "No separate recommendation failure was recorded."
                ),
            ),
            _check(
                "independent_auditor",
                "Independent auditor",
                "pass" if approved else "fail",
                (
                    "The independent Evidence Auditor approved publication."
                    if approved
                    else "The independent Evidence Auditor withheld publication."
                ),
            ),
            _check(
                "human_review",
                "Human review",
                "pass",
                "Human review remains mandatory regardless of the audit decision.",
            ),
            _check(
                "no_action_executed",
                "No action executed",
                "pass",
                "The audit and investigator have no payment-routing write capability.",
            ),
        ],
    )


def error_audit_view(*, summary: str) -> EvidenceAuditView:
    return EvidenceAuditView(
        status="error",
        summary=summary,
        issues=[],
        claims_reviewed=0,
        evidence_reviewed=0,
        requires_human_review=True,
        action_executed=False,
        checks=[
            _check(
                "independent_auditor",
                "Independent auditor",
                "fail",
                "The audited pipeline did not return a valid publication decision.",
            ),
            _check(
                "fail_closed",
                "Fail-closed publication gate",
                "pass",
                "PHAROS withheld the cause and published a safe inconclusive fallback.",
            ),
            _check(
                "human_review",
                "Human review",
                "pass",
                "The incident remains available for human review and a controlled retry.",
            ),
            _check(
                "no_action_executed",
                "No action executed",
                "pass",
                "No routing or payment action was executed.",
            ),
        ],
    )


def _classify_dimensions(
    truth: dict[str, str],
    diagnosed: dict[str, str],
) -> tuple[
    Literal["exact", "partial", "over_specific", "mixed", "incorrect"],
    dict[str, str],
    dict[str, str],
    dict[str, str],
    dict[str, DimensionConflict],
]:
    matching = {
        key: value
        for key, value in truth.items()
        if diagnosed.get(key) == value
    }
    missing = {key: value for key, value in truth.items() if key not in diagnosed}
    extra = {key: value for key, value in diagnosed.items() if key not in truth}
    conflicts = {
        key: DimensionConflict(truth=value, diagnosed=diagnosed[key])
        for key, value in truth.items()
        if key in diagnosed and diagnosed[key] != value
    }

    if truth == diagnosed:
        outcome = "exact"
    elif matching and missing and not extra and not conflicts:
        outcome = "partial"
    elif matching and not missing and extra and not conflicts:
        outcome = "over_specific"
    elif matching:
        outcome = "mixed"
    else:
        outcome = "incorrect"
    return outcome, matching, missing, extra, conflicts


def evaluate_blind_trial(
    *,
    revealed: ChaosSpec,
    incident_id: str | None,
    anomaly: Anomaly | None,
    report: IncidentReport | None,
    candidates: Collection[IncidentCandidate],
    evidence_audit: EvidenceAuditView | None,
    publication_reason: PublicationReason | None,
    ambiguous: bool,
    detection_latency_seconds: float | None,
    explanation_latency_seconds: float | None,
) -> BlindTrialEvaluation:
    """Compare one pre-associated report with truth that has already been revealed."""
    if not revealed.revealed or revealed.dimensions is None:
        raise ValueError("blind trial evaluation requires revealed ground truth")

    truth = {
        str(key): str(value)
        for key, value in revealed.dimensions.model_dump(exclude_none=True).items()
    }
    audit_status = evidence_audit.status if evidence_audit is not None else "not_run"
    diagnosed: dict[str, str] = {}
    matching: dict[str, str] = {}
    missing: dict[str, str] = dict(truth)
    extra: dict[str, str] = {}
    conflicts: dict[str, DimensionConflict] = {}
    estimated_degradation_pp: float | None = None
    severity_error_pp: float | None = None
    structural_evidence_valid = (
        report is not None
        and anomaly is not None
        and report.anomaly_id == anomaly.anomaly_id
    )
    abstention_assessment: Literal["justified", "unverified", "not_applicable"] = (
        "not_applicable"
    )

    if ambiguous:
        outcome = "ambiguous"
    elif report is None:
        outcome = "no_report"
    elif report.status is ReportStatus.inconclusive:
        outcome = "inconclusive"
        abstention_assessment = (
            "justified"
            if publication_reason in JUSTIFIED_ABSTENTION_REASONS
            or (
                publication_reason == "investigator_inconclusive"
                and audit_status == "approved"
            )
            else "unverified"
        )
    else:
        winner = next(
            (
                candidate
                for candidate in candidates
                if candidate.candidate_id == report.winning_candidate_id
            ),
            None,
        )
        if winner is None:
            outcome = "incorrect"
            structural_evidence_valid = False
        else:
            diagnosed = {
                str(key): str(value)
                for key, value in winner.dimensions.model_dump(exclude_none=True).items()
            }
            outcome, matching, missing, extra, conflicts = _classify_dimensions(
                truth,
                diagnosed,
            )
            estimated_degradation_pp = round(
                max(0.0, winner.current_decline_rate - winner.baseline_decline_rate) * 100,
                4,
            )
            severity_error_pp = round(
                abs(abs(revealed.severity_pp) - estimated_degradation_pp),
                4,
            )

    investigation_latency_seconds = (
        round(max(0.0, explanation_latency_seconds - detection_latency_seconds), 4)
        if explanation_latency_seconds is not None
        and detection_latency_seconds is not None
        else None
    )
    return BlindTrialEvaluation(
        chaos_id=revealed.chaos_id,
        incident_id=incident_id,
        outcome=outcome,
        truth_dimensions=truth,
        diagnosed_dimensions=diagnosed,
        matching_dimensions=matching,
        missing_dimensions=missing,
        extra_dimensions=extra,
        conflicting_dimensions=conflicts,
        injected_degradation_pp=abs(revealed.severity_pp),
        estimated_degradation_pp=estimated_degradation_pp,
        severity_error_pp=severity_error_pp,
        detection_latency_seconds=(
            round(max(0.0, detection_latency_seconds), 4)
            if detection_latency_seconds is not None
            else None
        ),
        explanation_latency_seconds=(
            round(max(0.0, explanation_latency_seconds), 4)
            if explanation_latency_seconds is not None
            else None
        ),
        investigation_latency_seconds=investigation_latency_seconds,
        structural_evidence_valid=structural_evidence_valid,
        evidence_audit_status=audit_status,
        abstention_assessment=abstention_assessment,
        human_review_required=True,
        action_executed=False,
    )
