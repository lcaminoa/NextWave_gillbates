"""Independent semantic review for an evidence-backed incident report.

The investigator explores hypotheses. The Evidence Auditor receives the finished, already
validated investigation and checks whether the cited evidence actually supports the wording.
It has no tools and cannot alter the report, select a new winner, or execute a recommendation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from contracts.schemas import Evidence, IncidentCandidate
from engine.investigator.runner import InvestigationResult
from engine.investigator.validation import ReportValidationError, validate_report


class AuditIssue(BaseModel):
    """One concrete reason why a report should not be published as written."""

    model_config = ConfigDict(extra="forbid")

    code: Literal[
        "unsupported_claim",
        "overstated_confidence",
        "missing_counterfactual",
        "unsafe_recommendation",
        "inconsistent_report",
        "other",
    ]
    message: str = Field(min_length=1)
    claim_index: int | None = Field(default=None, ge=0)
    evidence_ids: list[str] = Field(default_factory=list)


class EvidenceAudit(BaseModel):
    """Structured decision emitted by the independent Evidence Auditor."""

    model_config = ConfigDict(extra="forbid")

    approved: bool
    summary: str = Field(min_length=1)
    issues: list[AuditIssue]

    @model_validator(mode="after")
    def decision_matches_issues(self) -> "EvidenceAudit":
        if self.approved and self.issues:
            raise ValueError("an approved audit cannot contain issues")
        if not self.approved and not self.issues:
            raise ValueError("a rejected audit must explain at least one issue")
        return self


@dataclass(frozen=True)
class AuditedInvestigationResult:
    """The original investigation plus an independent publication decision."""

    investigation: InvestigationResult
    audit: EvidenceAudit


AUDITOR_INSTRUCTIONS = """
Sos el Evidence Auditor independiente de un investigador de incidentes de pagos. No vuelvas a
investigar ni elijas una causa nueva. Revisa exclusivamente el paquete recibido.

Aproba solo si:
- cada claim esta realmente respaldado por el contenido de las evidence_ids que cita;
- el lenguaje de certeza coincide con status y confidence;
- una afirmacion de aislamiento usa evidencia contrafactual cuando esa evidencia es necesaria;
- ganador, impacto y pasos son coherentes entre si;
- recommended_action es una recomendacion acotada, no una accion ejecutada, y mantiene revision
  humana.

Rechaza las interpretaciones que excedan la evidencia aunque los IDs existan. No rechaces por
estilo ni propongas otra causa raiz. En cada issue usa solamente evidence_ids presentes en el
paquete; usa una lista vacia para problemas generales de seguridad o coherencia.
""".strip()


def _audit_packet(
    result: InvestigationResult,
    candidates: list[IncidentCandidate] | tuple[IncidentCandidate, ...],
    evidence: list[Evidence] | tuple[Evidence, ...],
) -> dict[str, Any]:
    consulted = result.consulted_evidence_ids
    return {
        "report": result.report.model_dump(mode="json"),
        "ranked_candidates": [
            candidate.model_dump(mode="json")
            for candidate in sorted(candidates, key=lambda item: item.rca_score, reverse=True)
        ],
        "consulted_evidence": [
            item.model_dump(mode="json")
            for item in evidence
            if item.evidence_id in consulted
        ],
        "investigation_steps": [step.model_dump(mode="json") for step in result.steps],
    }


def _validate_audit(
    audit: EvidenceAudit,
    result: InvestigationResult,
) -> EvidenceAudit:
    known_evidence_ids = result.consulted_evidence_ids
    claim_count = len(result.report.claims)
    errors: list[str] = []

    for index, issue in enumerate(audit.issues):
        unknown_ids = set(issue.evidence_ids) - known_evidence_ids
        if unknown_ids:
            errors.append(
                f"audit issue[{index}] references unknown evidence: "
                + ", ".join(sorted(unknown_ids))
            )
        if issue.claim_index is not None and issue.claim_index >= claim_count:
            errors.append(f"audit issue[{index}] references unknown claim_index")

    if errors:
        raise ReportValidationError("; ".join(errors))
    return audit


def run_evidence_audit(
    result: InvestigationResult,
    candidates: list[IncidentCandidate] | tuple[IncidentCandidate, ...],
    evidence: list[Evidence] | tuple[Evidence, ...],
    *,
    model: str,
    client: Any | None = None,
) -> EvidenceAudit:
    """Review one completed investigation with a separate structured model call."""
    if not model.strip():
        raise ValueError("model must be an explicit non-empty model ID")

    validate_report(
        result.report,
        candidates=candidates,
        evidence=evidence,
        steps=result.steps,
        consulted_evidence_ids=result.consulted_evidence_ids,
    )

    if client is None:
        from openai import OpenAI

        client = OpenAI()

    response = client.responses.parse(
        model=model,
        instructions=AUDITOR_INSTRUCTIONS,
        input=[
            {
                "role": "user",
                "content": json.dumps(
                    _audit_packet(result, candidates, evidence),
                    ensure_ascii=False,
                ),
            }
        ],
        text_format=EvidenceAudit,
        store=False,
    )
    audit = response.output_parsed
    if audit is None:
        raise RuntimeError("model did not produce a parsed evidence audit")
    return _validate_audit(audit, result)


def run_audited_openai_investigation(
    anomaly_id: str,
    candidates: list[IncidentCandidate] | tuple[IncidentCandidate, ...],
    evidence: list[Evidence] | tuple[Evidence, ...],
    *,
    model: str,
    auditor_model: str | None = None,
    client: Any | None = None,
) -> AuditedInvestigationResult:
    """Run the investigator and then its independent Evidence Auditor."""
    from engine.investigator.openai_runner import run_openai_investigation

    investigation = run_openai_investigation(
        anomaly_id,
        candidates,
        evidence,
        model=model,
        client=client,
    )
    audit = run_evidence_audit(
        investigation,
        candidates,
        evidence,
        model=auditor_model or model,
        client=client,
    )
    return AuditedInvestigationResult(investigation=investigation, audit=audit)
