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

from contracts.schemas import Anomaly, Evidence, IncidentCandidate
from engine.investigator.runner import InvestigationResult
from engine.investigator.specificity import relevant_audit_candidates
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


class EvidenceAuditError(RuntimeError):
    """The independent audit could not produce a safe publication decision."""


@dataclass(frozen=True)
class AuditedInvestigationResult:
    """The original investigation plus an independent publication decision."""

    investigation: InvestigationResult
    audit: EvidenceAudit


AUDITOR_INSTRUCTIONS = """
Sos el Evidence Auditor independiente de Control Tower.

Recibis una investigacion terminada que ya paso validaciones estructurales. Tu unica funcion es
decidir si puede publicarse tal como esta escrita.

No vuelvas a investigar, no uses herramientas, no elijas otra causa raiz, no reescribas el informe
y no propongas una explicacion alternativa.

Aproba solo si:
- cada claim esta respaldado por el contenido exacto de las evidence_ids citadas;
- los IDs citados pertenecen al paquete recibido;
- el lenguaje de certeza coincide con status y confidence;
- una afirmacion de aislamiento, exclusividad o causalidad tiene evidencia contrafactual suficiente;
- ganador, claims, impacto y pasos son coherentes entre si;
- la recommended_action es concreta, acotada y proporcional a la evidencia;
- la recomendacion no afirma que una accion fue ejecutada y conserva revision humana.
- si el ganador agrega dimensiones frente a una hipotesis mas simple, existe evidencia incremental
  que aisla cada dimension agregada; un score mayor por si solo no alcanza.

La existencia de un evidence_id no significa automaticamente que respalde el claim. Evalua si el
contenido de esa evidencia demuestra realmente lo escrito.

Rechaza cuando:
- un claim exceda o contradiga su evidencia;
- se presente correlacion como causalidad demostrada;
- el nivel de certeza sea mayor que el permitido por la evidencia;
- falte un control necesario para afirmar que el problema esta aislado;
- el impacto o el ganador sean incoherentes con el resto de la investigacion;
- la recomendacion sea insegura, demasiado amplia o implique una accion ejecutada.

No rechaces por estilo, redaccion o preferencias personales.

Si rechazas, genera issues concretos y accionables. Indica claim_index cuando el problema corresponda
a un claim. Usa unicamente evidence_ids presentes en el paquete; para problemas generales de
seguridad o coherencia, usa una lista vacia.

Aproba solo cuando no exista ningun issue. Nunca conviertas incertidumbre en aprobacion.
""".strip()


def _audit_packet(
    anomaly: Anomaly,
    result: InvestigationResult,
    candidates: list[IncidentCandidate] | tuple[IncidentCandidate, ...],
    evidence: list[Evidence] | tuple[Evidence, ...],
) -> dict[str, Any]:
    consulted = result.consulted_evidence_ids
    relevant_candidates = relevant_audit_candidates(
        result.report.winning_candidate_id,
        candidates,
    )
    return {
        "anomaly": anomaly.model_dump(mode="json"),
        "report": result.report.model_dump(mode="json"),
        "relevant_candidates": [
            candidate.model_dump(mode="json")
            for candidate in relevant_candidates
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
    packet_evidence_ids: set[str],
) -> EvidenceAudit:
    claim_count = len(result.report.claims)
    errors: list[str] = []

    for index, issue in enumerate(audit.issues):
        unknown_ids = set(issue.evidence_ids) - packet_evidence_ids
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
    anomaly: Anomaly,
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

    if anomaly.anomaly_id != result.report.anomaly_id:
        raise ReportValidationError("audit anomaly does not match the incident report")

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

    packet = _audit_packet(anomaly, result, candidates, evidence)
    packet_evidence_ids = {
        str(item["evidence_id"]) for item in packet["consulted_evidence"]
    }
    try:
        response = client.responses.parse(
            model=model,
            instructions=AUDITOR_INSTRUCTIONS,
            input=[
                {
                    "role": "user",
                    "content": json.dumps(packet, ensure_ascii=False),
                }
            ],
            text_format=EvidenceAudit,
            store=False,
        )
    except Exception as exc:
        raise EvidenceAuditError(
            "evidence audit failed; the incident report must not be published"
        ) from exc

    audit = getattr(response, "output_parsed", None)
    if audit is None:
        raise EvidenceAuditError(
            "evidence audit returned no decision; the incident report must not be published"
        )
    return _validate_audit(audit, result, packet_evidence_ids)


def run_audited_openai_investigation(
    anomaly: Anomaly,
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
        anomaly.anomaly_id,
        candidates,
        evidence,
        model=model,
        client=client,
    )
    audit = run_evidence_audit(
        anomaly,
        investigation,
        candidates,
        evidence,
        model=auditor_model or model,
        client=client,
    )
    return AuditedInvestigationResult(investigation=investigation, audit=audit)
