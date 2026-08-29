"""Deterministic output guardrails for IncidentReport.

Valid JSON is not sufficient. The report must cite existing evidence, must only cite evidence
actually consulted by the investigation, and must respect the status/winner invariants.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

from contracts.schemas import Evidence, IncidentCandidate, IncidentReport, InvestigationStep, ReportStatus


class ReportValidationError(ValueError):
    """Raised when a report is structurally valid but unsupported by its evidence."""


ENTITY_TOKEN_PATTERN = re.compile(r"\b[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+\b")


def _allowed_entity_tokens(
    candidates: Sequence[IncidentCandidate], evidence: Sequence[Evidence]
) -> set[str]:
    allowed = {
        "payment_method",
        "issuing_bank",
        "canonical_decline_code",
        "candidate_id",
        "evidence_id",
        "evidence_ids",
    }
    for candidate in candidates:
        allowed.add(candidate.candidate_id)
        allowed.add(candidate.anomaly_id)
        allowed.update(
            str(value)
            for value in candidate.dimensions.model_dump(exclude_none=True).values()
        )
        if candidate.dominant_decline_code:
            allowed.add(candidate.dominant_decline_code)
    for item in evidence:
        allowed.add(item.evidence_id)
        allowed.add(item.source)
        if item.dimension_key:
            allowed.update(ENTITY_TOKEN_PATTERN.findall(item.dimension_key))
    return allowed


def validate_report(
    report: IncidentReport,
    *,
    candidates: Sequence[IncidentCandidate],
    evidence: Sequence[Evidence],
    steps: Sequence[InvestigationStep],
    consulted_evidence_ids: Iterable[str],
) -> IncidentReport:
    errors: list[str] = []
    candidate_by_id = {candidate.candidate_id: candidate for candidate in candidates}
    evidence_ids = {item.evidence_id for item in evidence}
    consulted_ids = set(consulted_evidence_ids)
    actual_step_ids = [step.step_id for step in steps]
    allowed_entity_tokens = _allowed_entity_tokens(candidates, evidence)

    if report.status == ReportStatus.inconclusive:
        if report.winning_candidate_id is not None:
            errors.append("inconclusive reports cannot have a winning_candidate_id")
    elif report.winning_candidate_id is None:
        errors.append("confirmed/probable reports require a winning_candidate_id")

    if report.winning_candidate_id is not None:
        winner = candidate_by_id.get(report.winning_candidate_id)
        if winner is None:
            errors.append(f"unknown winning_candidate_id: {report.winning_candidate_id}")
        elif winner.anomaly_id != report.anomaly_id:
            errors.append("winning candidate belongs to a different anomaly")

    for index, claim in enumerate(report.claims):
        if not claim.evidence_ids:
            errors.append(f"claim[{index}] has no evidence_ids")
            continue
        unknown_ids = set(claim.evidence_ids) - evidence_ids
        if unknown_ids:
            errors.append(
                f"claim[{index}] references unknown evidence: {', '.join(sorted(unknown_ids))}"
            )
        unconsulted_ids = set(claim.evidence_ids) - consulted_ids
        if unconsulted_ids:
            errors.append(
                f"claim[{index}] cites evidence not consulted: "
                f"{', '.join(sorted(unconsulted_ids))}"
            )

    grounded_texts = [report.summary, report.recommended_action]
    grounded_texts.extend(claim.claim for claim in report.claims)
    unknown_entity_tokens = {
        token
        for text in grounded_texts
        for token in ENTITY_TOKEN_PATTERN.findall(text)
        if token not in allowed_entity_tokens
    }
    if unknown_entity_tokens:
        errors.append(
            "report contains ungrounded entity tokens: "
            + ", ".join(sorted(unknown_entity_tokens))
        )

    if report.winning_candidate_id is not None:
        winner = candidate_by_id.get(report.winning_candidate_id)
        cited_ids = {item for claim in report.claims for item in claim.evidence_ids}
        if winner is not None and not (set(winner.evidence_ids) & cited_ids):
            errors.append("report does not cite evidence from the winning candidate")

    if report.investigation_steps != actual_step_ids:
        errors.append("investigation_steps must reference every emitted step in order")

    if not report.requires_human_review:
        errors.append("every report must require human review")

    if not report.recommended_action.strip():
        errors.append("recommended_action cannot be empty")

    if errors:
        raise ReportValidationError("; ".join(errors))
    return report
