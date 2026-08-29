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
from engine.investigator.specificity import (
    filter_specificity_supported_candidates,
    maximal_simpler_candidates,
)
from engine.investigator.tools import ReadOnlyInvestigationTools, ToolCallRecord
from engine.investigator.validation import validate_report

# ``confidence`` measures the share of the observed decline that exceeds the
# segment's own baseline; it is not a calibrated probability that the cause is
# true. Detection already requires a credible-interval breach, EWMA breach, and
# sustained windows. Requiring 65% here rejected statistically confirmed issuer
# incidents with enough volume, so publication uses 50% plus the RCA margin,
# specificity, and volume guards below (D019).
MIN_PROBABLE_CONFIDENCE = 0.50
MIN_WINNER_MARGIN = 0.08
MIN_CONFIRMED_CONFIDENCE = 0.90
MIN_CONFIRMED_MARGIN = 0.15
MIN_ESTIMATED_SEGMENT_VOLUME = 20


@dataclass(frozen=True)
class InvestigationResult:
    report: IncidentReport
    steps: tuple[InvestigationStep, ...]
    consulted_evidence_ids: frozenset[str]
    tool_calls: tuple[ToolCallRecord, ...]


def report_loss_per_hour(report: IncidentReport) -> float:
    """Return the report's explicitly hourly revenue-loss estimate."""
    return float(report.estimated_revenue_loss_usd_per_hour)


def _estimated_segment_volume(candidate: IncidentCandidate) -> float:
    """Recover segment attempts from rejected count and current decline rate."""
    if candidate.current_decline_rate <= 0:
        return 0.0
    return candidate.affected_count / candidate.current_decline_rate


def _has_publishable_volume(candidate: IncidentCandidate) -> bool:
    return _estimated_segment_volume(candidate) >= MIN_ESTIMATED_SEGMENT_VOLUME


def filter_publishable_candidates(
    candidates: list[IncidentCandidate] | tuple[IncidentCandidate, ...],
    evidence: list[Evidence] | tuple[Evidence, ...],
) -> tuple[IncidentCandidate, ...]:
    """Apply the shared deterministic publication policy for every runner mode."""
    return tuple(
        candidate
        for candidate in filter_specificity_supported_candidates(candidates, evidence)
        if _has_publishable_volume(candidate)
    )


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
    specificity_supported_candidates = filter_specificity_supported_candidates(candidates, evidence)
    # Keep low-volume RCA slices visible in incident detail, but never let one
    # outrank and suppress a broader, publishable root cause.
    eligible_candidates = filter_publishable_candidates(candidates, evidence)
    tools = ReadOnlyInvestigationTools(anomaly_id, eligible_candidates, evidence)
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
                else (
                    "Stream B produjo hipotesis, pero ninguna tiene el volumen minimo "
                    "para publicarse."
                    if specificity_supported_candidates
                    else "Stream B no produjo una hipotesis defendible."
                )
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
                "Se detecto una degradacion, pero las hipotesis disponibles todavia no "
                "tienen volumen suficiente para publicar una causa."
                if specificity_supported_candidates
                else (
                    "Se detecto una degradacion, pero todavia no existe una explicacion "
                    "respaldada por evidencia."
                )
            ),
            claims=[],
            recommended_action=(
                "Mantener revision humana y reunir mas transacciones antes de atribuir la causa."
            ),
            requires_human_review=True,
            investigation_steps=[step.step_id for step in steps],
            estimated_revenue_loss_usd_per_hour=0.0,
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

    eligible_by_id = {
        candidate.candidate_id: candidate for candidate in eligible_candidates
    }
    top_candidate = eligible_by_id[top_id]
    alternative_candidates = list(
        maximal_simpler_candidates(top_candidate, eligible_candidates)
    )
    comparison = tools.compare_top_candidates(top_id)
    runner_up_data = comparison["runner_up"]
    if runner_up_data is not None:
        runner_up = eligible_by_id[str(runner_up_data["candidate_id"])]
        if runner_up.candidate_id not in {
            candidate.candidate_id for candidate in alternative_candidates
        }:
            alternative_candidates.append(runner_up)

    alternative_evidence: list[dict[str, Any]] = []
    primary_alternative_data: dict[str, Any] | None = None
    primary_alternative_evidence: list[dict[str, Any]] = []
    for alternative in alternative_candidates:
        alternative_id = alternative.candidate_id
        current_evidence = tools.get_candidate_evidence(alternative_id)
        alternative_evidence.extend(current_evidence)
        alternative_data = alternative.model_dump(mode="json")
        if primary_alternative_data is None:
            primary_alternative_data = alternative_data
            primary_alternative_evidence = current_evidence
        steps.append(
            _step(
                anomaly_id,
                len(steps) + 1,
                f"get_candidate_evidence(candidate_id={alternative_id})",
                (
                    f"Se reviso la alternativa {_dimensions_text(alternative_data)} con "
                    f"{len(current_evidence)} evidencias."
                ),
                alternative_id,
            )
        )

    confidence_margin = float(comparison["confidence_margin"])
    score_margin = float(comparison["score_margin"])
    top_confidence = float(top["confidence"])
    estimated_segment_volume = _estimated_segment_volume(top_candidate)
    steps.append(
        _step(
            anomaly_id,
            len(steps) + 1,
            "compare_top_candidates()",
            (
                f"Confianza principal {top_confidence:.0%}; margen de confianza "
                f"{confidence_margin:.0%}; ventaja RCA {score_margin:.0%}; volumen "
                f"estimado {estimated_segment_volume:.0f}."
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

    low_confidence = top_confidence < MIN_PROBABLE_CONFIDENCE
    close_competition = score_margin < MIN_WINNER_MARGIN
    insufficient_volume = estimated_segment_volume < MIN_ESTIMATED_SEGMENT_VOLUME
    ambiguous = low_confidence or close_competition or insufficient_volume
    consulted_for_claim = _evidence_ids(top_evidence + alternative_evidence)

    if ambiguous:
        status = ReportStatus.inconclusive
        winner_id = None
        if insufficient_volume:
            summary = (
                "La degradacion es real, pero la hipotesis principal todavia no tiene volumen "
                "suficiente para publicarse."
            )
            claim_text = (
                "La evidencia de la hipotesis principal proviene de un segmento con volumen "
                "insuficiente."
            )
        elif low_confidence:
            summary = (
                "La degradacion es real, pero la confianza de la hipotesis principal no alcanza "
                "el minimo necesario para atribuir la causa."
            )
            claim_text = (
                "La hipotesis principal no alcanza el nivel minimo de confianza para publicarse."
            )
        else:
            summary = (
                "La degradacion es real, pero la evidencia actual no permite separar con seguridad "
                f"{_dimensions_text(top)} de la siguiente hipotesis."
            )
            claim_text = (
                "Las principales hipotesis permanecen estadisticamente demasiado cercanas."
            )
        claims = [
            Claim(
                claim=claim_text,
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
            and score_margin >= MIN_CONFIRMED_MARGIN
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
                claim=(
                    f"{dimensions_text} es la hipotesis con mayor respaldo para explicar "
                    "la degradacion observada."
                ),
                evidence_ids=_evidence_ids(top_evidence),
                confidence=round(top_confidence, 4),
            )
        ]
        counterfactual_ids = [
            str(item["evidence_id"])
            for item in top_evidence
            if str(item.get("source", "")).startswith("counterfactual_")
        ]
        if counterfactual_ids:
            claims.append(
                Claim(
                    claim=(
                        "La evidencia contrafactual consultada muestra trafico comparable "
                        "con mejor desempeno fuera de la interseccion principal."
                    ),
                    evidence_ids=counterfactual_ids,
                    confidence=round(top_confidence, 4),
                )
            )
        if primary_alternative_data is not None and primary_alternative_evidence:
            claims.append(
                Claim(
                    claim=(
                        f"La alternativa {_dimensions_text(primary_alternative_data)} queda "
                        "por debajo de la hipotesis principal."
                    ),
                    evidence_ids=(
                        [
                            _evidence_ids(top_evidence)[0],
                            _evidence_ids(primary_alternative_evidence)[0],
                        ]
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
        estimated_revenue_loss_usd_per_hour=float(
            impact["estimated_revenue_loss_usd_per_hour"]
        ),
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
