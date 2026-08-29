"""Deterministic Stream C fixtures that obey the shared contracts.

These cases let the investigator advance without an OpenAI key or the final Stream A pipeline.
They intentionally model a clear diagnosis, an ambiguous diagnosis, and an anomaly with no
viable candidates.
"""

from __future__ import annotations

from dataclasses import dataclass

from contracts.schemas import Dimensions, Evidence, IncidentCandidate


@dataclass(frozen=True)
class InvestigationCase:
    name: str
    anomaly_id: str
    candidates: tuple[IncidentCandidate, ...]
    evidence: tuple[Evidence, ...]


def clear_provider_country_case() -> InvestigationCase:
    """A strong NovaPay x Brazil incident with a healthy provider control."""
    evidence = (
        Evidence(
            evidence_id="ev_clear_baseline",
            source="baseline_comparison",
            summary="NovaPay en BR: rechazo subio de 12% a 49% en la ventana evaluada.",
            value=0.37,
            dimension_key="country=BR|provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_clear_control",
            source="counterfactual_provider",
            summary="Mismo pais y metodo mediante atlas_pay mantiene 90% de aprobacion.",
            value=0.90,
            dimension_key="country=BR|provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_clear_declines",
            source="decline_code_distribution",
            summary="issuer_unavailable concentra 64% de los rechazos del segmento afectado.",
            value=0.64,
            dimension_key="country=BR|provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_provider_baseline",
            source="baseline_comparison",
            summary="NovaPay global: rechazo subio de 13% a 25%.",
            value=0.12,
            dimension_key="provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_country_baseline",
            source="baseline_comparison",
            summary="Brasil global: rechazo subio de 11% a 20%.",
            value=0.09,
            dimension_key="country=BR",
        ),
    )
    candidates = (
        IncidentCandidate(
            candidate_id="cand_novapay_br",
            anomaly_id="anom_clear",
            dimensions=Dimensions(provider="nova_pay", country="BR"),
            confidence=0.93,
            affected_count=142,
            baseline_decline_rate=0.12,
            current_decline_rate=0.49,
            dominant_decline_code="issuer_unavailable",
            estimated_revenue_loss_usd_per_hour=11220.0,
            rca_score=0.91,
            evidence_ids=["ev_clear_baseline", "ev_clear_control", "ev_clear_declines"],
            counterfactual_check="atlas_pay permanece saludable para el trafico comparable",
        ),
        IncidentCandidate(
            candidate_id="cand_novapay",
            anomaly_id="anom_clear",
            dimensions=Dimensions(provider="nova_pay"),
            confidence=0.72,
            affected_count=190,
            baseline_decline_rate=0.13,
            current_decline_rate=0.25,
            dominant_decline_code="issuer_unavailable",
            estimated_revenue_loss_usd_per_hour=8300.0,
            rca_score=0.61,
            evidence_ids=["ev_provider_baseline"],
        ),
        IncidentCandidate(
            candidate_id="cand_br",
            anomaly_id="anom_clear",
            dimensions=Dimensions(country="BR"),
            confidence=0.64,
            affected_count=205,
            baseline_decline_rate=0.11,
            current_decline_rate=0.20,
            dominant_decline_code="issuer_unavailable",
            estimated_revenue_loss_usd_per_hour=6900.0,
            rca_score=0.49,
            evidence_ids=["ev_country_baseline"],
        ),
    )
    return InvestigationCase(
        name="clear_provider_country",
        anomaly_id="anom_clear",
        candidates=candidates,
        evidence=evidence,
    )


def ambiguous_provider_issuer_case() -> InvestigationCase:
    """Two nearly tied explanations that should force an inconclusive report."""
    evidence = (
        Evidence(
            evidence_id="ev_amb_provider",
            source="baseline_comparison",
            summary="NovaPay presenta una caida, pero el volumen aun es limitado.",
            value=0.16,
            dimension_key="provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_amb_issuer",
            source="baseline_comparison",
            summary="Itau presenta una caida similar en la misma ventana.",
            value=0.15,
            dimension_key="issuing_bank=itau",
        ),
    )
    candidates = (
        IncidentCandidate(
            candidate_id="cand_amb_provider",
            anomaly_id="anom_ambiguous",
            dimensions=Dimensions(provider="nova_pay"),
            confidence=0.73,
            affected_count=18,
            baseline_decline_rate=0.12,
            current_decline_rate=0.28,
            dominant_decline_code="issuer_unavailable",
            estimated_revenue_loss_usd_per_hour=2100.0,
            rca_score=0.55,
            evidence_ids=["ev_amb_provider"],
        ),
        IncidentCandidate(
            candidate_id="cand_amb_issuer",
            anomaly_id="anom_ambiguous",
            dimensions=Dimensions(issuing_bank="itau"),
            confidence=0.71,
            affected_count=17,
            baseline_decline_rate=0.11,
            current_decline_rate=0.26,
            dominant_decline_code="issuer_unavailable",
            estimated_revenue_loss_usd_per_hour=2050.0,
            rca_score=0.54,
            evidence_ids=["ev_amb_issuer"],
        ),
    )
    return InvestigationCase(
        name="ambiguous_provider_issuer",
        anomaly_id="anom_ambiguous",
        candidates=candidates,
        evidence=evidence,
    )


def no_candidate_case() -> InvestigationCase:
    """An anomaly exists, but Stream B has not produced a defensible explanation."""
    return InvestigationCase(
        name="no_candidates",
        anomaly_id="anom_no_candidates",
        candidates=(),
        evidence=(),
    )
