"""API-free investigation runner used to prove the Stream C behavior.

The deterministic policy is a temporary stand-in for the future OpenAI agent. Tools, evidence
tracking, output contracts, and validation remain the same when the model is connected.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from contracts.schemas import (
    Claim,
    Evidence,
    IncidentCandidate,
    IncidentReport,
    InvestigationStep,
    ReportStatus,
)
from engine.investigator.tools import ReadOnlyInvestigationTools, ToolCallRecord
from engine.investigator.validation import validate_report

MIN_PROBABLE_CONFIDENCE = 0.65
MIN_WINNER_MARGIN = 0.08
MIN_CONFIRMED_CONFIDENCE = 0.90
MIN_CONFIRMED_MARGIN = 0.15


@dataclass(frozen=True)
class InvestigationResult:
    report: IncidentReport
    steps: tuple[InvestigationStep, ...]
    consulted_evidence_ids: frozenset[str]
    tool_calls: tuple[ToolCallRecord, ...]


def report_loss_fields(value: float) -> dict[str, float]:
    """Support the announced IncidentReport field rename while branches converge."""
    new_name = "estimated_revenue_loss_usd_per_hour"
    if new_name in IncidentReport.model_fields:
        return {new_name: value}
    return {"estimated_revenue_loss_usd": value}


def report_loss_per_hour(report: IncidentReport) -> float:
    """Read the hourly loss consistently before and after the contract rename."""
    new_name = "estimated_revenue_loss_usd_per_hour"
    if new_name in IncidentReport.model_fields:
        return float(getattr(report, new_name))
    return float(report.estimated_revenue_loss_usd)


def _dimensions_text(candidate_data: dict[str, Any]) -> str:
    dimensions = candidate_data.get("dimensions", {})
    active = [f"{key}={value}" for key, value in dimensions.items() if value is not None]
    return " x ".join(active) if active else "global"


def _step(
    anomaly_id: str,
    index: int,
    action: str,
    result_summary: str,
    candidate_id: str | None = None,
) -> InvestigationStep:
    return InvestigationStep(
        step_id=f"step_{anomaly_id}_{index:02d}",
        candidate_id=candidate_id or anomaly_id,
        timestamp=datetime.now(timezone.utc),
        action=action,
        result_summary=result_summary,
    )


def _evidence_ids(items: list[dict[str, Any]]) -> list[str]:
    return [str(item["evidence_id"]) for item in items]


def run_investigation(
    anomaly_id: str,
    candidates: list[IncidentCandidate] | tuple[IncidentCandidate, ...],
    evidence: list[Evidence] | tuple[Evidence, ...],
) -> InvestigationResult:
    """Run a deterministic, auditable investigation and return a validated report."""
    tools = ReadOnlyInvestigationTools(anomaly_id, candidates, evidence)
    steps: list[InvestigationStep] = []

    ranked = tools.rank_candidates(limit=5)
    steps.append(
        _step(
            anomaly_id,
            len(steps) + 1,
            "rank_candidates(limit=5)",
            (
                f"Se encontraron {len(ranked)} hipotesis; la primera es "
                f"{_dimensions_text(ranked[0])}."
                if ranked
                else "Stream B no produjo una hipotesis defendible."
            ),
        )
    )

    if not ranked:
        steps.append(
            _step(
                anomaly_id,
                len(steps) + 1,
                "assess_evidence_sufficiency()",
                "No hay evidencia suficiente para publicar una causa raiz.",
            )
        )
        report = IncidentReport(
            incident_id=f"inc_{anomaly_id}",
            anomaly_id=anomaly_id,
            generated_at=datetime.now(timezone.utc),
            status=ReportStatus.inconclusive,
            summary=(
                "Se detecto una degradacion, pero todavia no existe una explicacion "
                "respaldada por evidencia."
            ),
            claims=[],
            recommended_action=(
                "Mantener revision humana y reunir mas transacciones antes de atribuir la causa."
            ),
            requires_human_review=True,
            investigation_steps=[step.step_id for step in steps],
            **report_loss_fields(0.0),
        )
        validate_report(
            report,
            candidates=candidates,
            evidence=evidence,
            steps=steps,
            consulted_evidence_ids=tools.consulted_evidence_ids,
        )
        return InvestigationResult(
            report=report,
            steps=tuple(steps),
            consulted_evidence_ids=tools.consulted_evidence_ids,
            tool_calls=tools.call_records,
        )

    top = ranked[0]
    top_id = str(top["candidate_id"])
    top_evidence = tools.get_candidate_evidence(top_id)
    steps.append(
        _step(
            anomaly_id,
            len(steps) + 1,
            f"get_candidate_evidence(candidate_id={top_id})",
            f"Se consultaron {len(top_evidence)} evidencias para {_dimensions_text(top)}.",
            top_id,
        )
    )

    alternative_evidence: list[dict[str, Any]] = []
    if len(ranked) > 1:
        alternative_id = str(ranked[1]["candidate_id"])
        alternative_evidence = tools.get_candidate_evidence(alternative_id)
        steps.append(
            _step(
                anomaly_id,
                len(steps) + 1,
                f"get_candidate_evidence(candidate_id={alternative_id})",
                (
                    f"Se reviso la alternativa {_dimensions_text(ranked[1])} con "
                    f"{len(alternative_evidence)} evidencias."
                ),
                alternative_id,
            )
        )

    comparison = tools.compare_top_candidates()
    confidence_margin = float(comparison["confidence_margin"])
    top_confidence = float(top["confidence"])
    steps.append(
        _step(
            anomaly_id,
            len(steps) + 1,
            "compare_top_candidates()",
            (
                f"Confianza principal {top_confidence:.0%}; margen contra la alternativa "
                f"{confidence_margin:.0%}."
            ),
            top_id,
        )
    )

    impact = tools.get_financial_impact(top_id)
    steps.append(
        _step(
            anomaly_id,
            len(steps) + 1,
            f"get_financial_impact(candidate_id={top_id})",
            (
                f"Impacto estimado: USD "
                f"{impact['estimated_revenue_loss_usd_per_hour']:.2f}/h."
            ),
            top_id,
        )
    )

    ambiguous = (
        top_confidence < MIN_PROBABLE_CONFIDENCE
        or confidence_margin < MIN_WINNER_MARGIN
    )
    consulted_for_claim = _evidence_ids(top_evidence + alternative_evidence)

    if ambiguous:
        status = ReportStatus.inconclusive
        winner_id = None
        summary = (
            "La degradacion es real, pero la evidencia actual no permite separar con seguridad "
            f"{_dimensions_text(top)} de la siguiente hipotesis."
        )
        claims = [
            Claim(
                claim="Las principales hipotesis permanecen estadisticamente demasiado cercanas.",
                evidence_ids=consulted_for_claim,
                confidence=round(top_confidence, 4),
            )
        ]
        recommendation = (
            "Esperar mas volumen y repetir los controles antes de atribuir la causa o recomendar "
            "un cambio de routing."
        )
    else:
        status = (
            ReportStatus.confirmed
            if top_confidence >= MIN_CONFIRMED_CONFIDENCE
            and confidence_margin >= MIN_CONFIRMED_MARGIN
            else ReportStatus.probable
        )
        winner_id = top_id
        dimensions_text = _dimensions_text(top)
        summary = (
            f"La mejor explicacion respaldada por evidencia es {dimensions_text}, con "
            f"{top_confidence:.0%} de confianza y un impacto estimado de USD "
            f"{impact['estimated_revenue_loss_usd_per_hour']:.2f}/h."
        )
        claims = [
            Claim(
                claim=f"La degradacion esta aislada a {dimensions_text}.",
                evidence_ids=_evidence_ids(top_evidence),
                confidence=round(top_confidence, 4),
            )
        ]
        counterfactual_ids = [
            str(item["evidence_id"])
            for item in top_evidence
            if item.get("source") == "counterfactual_provider"
        ]
        if counterfactual_ids:
            claims.append(
                Claim(
                    claim="Un proveedor alternativo permanece saludable para trafico comparable.",
                    evidence_ids=counterfactual_ids,
                    confidence=round(top_confidence, 4),
                )
            )
        if len(ranked) > 1 and alternative_evidence:
            claims.append(
                Claim(
                    claim=(
                        f"La explicacion mas general {_dimensions_text(ranked[1])} queda por "
                        "debajo de la interseccion principal."
                    ),
                    evidence_ids=(
                        [_evidence_ids(top_evidence)[0], _evidence_ids(alternative_evidence)[0]]
                    ),
                    confidence=round(top_confidence, 4),
                )
            )
        recommendation = (
            f"Revisar {dimensions_text} con el equipo de pagos y evaluar una mitigacion acotada; "
            "no ejecutar cambios sin aprobacion humana."
        )

    steps.append(
        _step(
            anomaly_id,
            len(steps) + 1,
            "publish_evidence_backed_report()",
            f"Investigacion finalizada con estado {status.value}.",
            winner_id or top_id,
        )
    )
    report = IncidentReport(
        incident_id=f"inc_{anomaly_id}",
        anomaly_id=anomaly_id,
        generated_at=datetime.now(timezone.utc),
        status=status,
        winning_candidate_id=winner_id,
        summary=summary,
        claims=claims,
        recommended_action=recommendation,
        requires_human_review=True,
        investigation_steps=[step.step_id for step in steps],
        **report_loss_fields(float(impact["estimated_revenue_loss_usd_per_hour"])),
    )
    validate_report(
        report,
        candidates=candidates,
        evidence=evidence,
        steps=steps,
        consulted_evidence_ids=tools.consulted_evidence_ids,
    )
    return InvestigationResult(
        report=report,
        steps=tuple(steps),
        consulted_evidence_ids=tools.consulted_evidence_ids,
        tool_calls=tools.call_records,
    )
