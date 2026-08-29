from __future__ import annotations

import pytest

from contracts.schemas import Claim, Dimensions, Evidence, IncidentCandidate, ReportStatus
from engine.investigator.mock_data import (
    ambiguous_provider_issuer_case,
    clear_provider_country_case,
    no_candidate_case,
)
from engine.investigator.runner import report_loss_per_hour, run_investigation
from engine.investigator.tools import (
    ReadOnlyInvestigationTools,
    ToolBudgetExceeded,
    ToolLookupError,
)
from engine.investigator.validation import ReportValidationError, validate_report


def _clear_single_dimension_candidates(
    *,
    anomaly_id: str,
    dimensions: Dimensions,
    added_dimension: str,
    added_value: str,
    confidence: float,
    rca_score: float,
) -> tuple[tuple[IncidentCandidate, ...], tuple[Evidence, ...]]:
    dimension_values = dimensions.model_dump(exclude_none=True)
    dimension_key = "|".join(
        f"{key}={value}" for key, value in dimension_values.items()
    )
    specific_values = {**dimension_values, added_dimension: added_value}
    specific_key = "|".join(
        f"{key}={value}" for key, value in specific_values.items()
    )
    evidence = (
        Evidence(
            evidence_id=f"ev_{anomaly_id}_baseline",
            source="baseline_comparison",
            summary=f"{dimension_key}: rechazo subio de 10% a 45% con volumen suficiente.",
            value=0.35,
            dimension_key=dimension_key,
        ),
        Evidence(
            evidence_id=f"ev_{anomaly_id}_specific",
            source="baseline_comparison",
            summary=f"{specific_key}: rechazo subio de 10% a 60%.",
            value=0.50,
            dimension_key=specific_key,
        ),
        Evidence(
            evidence_id=f"ev_{anomaly_id}_control",
            source=f"counterfactual_{added_dimension}",
            summary=f"El control de {added_dimension} permanece saludable.",
            value=0.90,
            dimension_key=specific_key,
        ),
    )
    candidates = (
        IncidentCandidate(
            candidate_id=f"cand_{anomaly_id}_root",
            anomaly_id=anomaly_id,
            dimensions=dimensions,
            confidence=confidence,
            affected_count=45,
            baseline_decline_rate=0.10,
            current_decline_rate=0.45,
            estimated_revenue_loss_usd_per_hour=12_000,
            rca_score=rca_score,
            evidence_ids=[evidence[0].evidence_id],
        ),
        IncidentCandidate(
            candidate_id=f"cand_{anomaly_id}_specific",
            anomaly_id=anomaly_id,
            dimensions=Dimensions(**specific_values),
            confidence=0.86,
            affected_count=18,
            baseline_decline_rate=0.10,
            current_decline_rate=0.60,
            estimated_revenue_loss_usd_per_hour=5_000,
            rca_score=0.36,
            evidence_ids=[evidence[1].evidence_id, evidence[2].evidence_id],
            counterfactual_check=f"Se comparo {added_dimension} dentro del segmento.",
        ),
    )
    return candidates, evidence


def test_clear_case_produces_confirmed_evidence_backed_report() -> None:
    case = clear_provider_country_case()
    result = run_investigation(case.anomaly_id, case.candidates, case.evidence)

    assert result.report.status == ReportStatus.confirmed
    assert result.report.winning_candidate_id == "cand_novapay_br"
    assert result.report.requires_human_review is True
    assert result.report.claims
    assert len(result.steps) >= 5
    assert set(result.report.claims[0].evidence_ids) <= result.consulted_evidence_ids


@pytest.mark.parametrize(
    ("case_name", "dimensions", "added_dimension", "added_value", "confidence", "rca_score"),
    [
        (
            "provider",
            Dimensions(provider="nova_pay"),
            "merchant",
            "TiendaNorte",
            0.7956,
            0.7956,
        ),
        (
            "issuing_bank",
            Dimensions(issuing_bank="itau"),
            "merchant",
            "TiendaNorte",
            0.7883,
            0.7883,
        ),
        (
            "merchant",
            Dimensions(merchant="VuelaYa"),
            "country",
            "AR",
            0.7093,
            0.7093,
        ),
    ],
)
def test_clear_single_dimension_incident_beats_narrow_high_confidence_segment(
    case_name: str,
    dimensions: Dimensions,
    added_dimension: str,
    added_value: str,
    confidence: float,
    rca_score: float,
) -> None:
    anomaly_id = f"anom_calibration_{case_name}"
    candidates, evidence = _clear_single_dimension_candidates(
        anomaly_id=anomaly_id,
        dimensions=dimensions,
        added_dimension=added_dimension,
        added_value=added_value,
        confidence=confidence,
        rca_score=rca_score,
    )

    result = run_investigation(anomaly_id, candidates, evidence)

    assert result.report.status in {ReportStatus.confirmed, ReportStatus.probable}
    assert result.report.winning_candidate_id == f"cand_{anomaly_id}_root"


def test_clear_provider_country_incident_uses_incremental_evidence_and_rca_margin() -> None:
    anomaly_id = "anom_calibration_provider_country"
    evidence = (
        Evidence(
            evidence_id="ev_combo_baseline",
            source="baseline_comparison",
            summary="NovaPay en BR: rechazo subio de 10% a 45%.",
            value=0.35,
            dimension_key="country=BR|provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_combo_provider_control",
            source="counterfactual_provider",
            summary="Otro provider en BR mantiene 90% de aprobacion.",
            value=0.90,
            dimension_key="country=BR|provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_combo_country_control",
            source="counterfactual_country",
            summary="NovaPay fuera de BR mantiene 88% de aprobacion.",
            value=0.88,
            dimension_key="country=BR|provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_combo_competitor",
            source="baseline_comparison",
            summary="NovaPay en TiendaNorte: rechazo subio de 10% a 40%.",
            value=0.30,
            dimension_key="merchant=TiendaNorte|provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_combo_merchant_control",
            source="counterfactual_merchant",
            summary="Otro merchant con NovaPay mantiene un desempeno saludable.",
            value=0.90,
            dimension_key="merchant=TiendaNorte|provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_combo_provider",
            source="baseline_comparison",
            summary="NovaPay global: rechazo subio de 10% a 25%.",
            value=0.15,
            dimension_key="provider=nova_pay",
        ),
        Evidence(
            evidence_id="ev_combo_country",
            source="baseline_comparison",
            summary="BR global: rechazo subio de 10% a 20%.",
            value=0.10,
            dimension_key="country=BR",
        ),
    )
    candidates = (
        IncidentCandidate(
            candidate_id="cand_combo_root",
            anomaly_id=anomaly_id,
            dimensions=Dimensions(provider="nova_pay", country="BR"),
            confidence=0.7566,
            affected_count=45,
            baseline_decline_rate=0.10,
            current_decline_rate=0.45,
            estimated_revenue_loss_usd_per_hour=12_000,
            rca_score=0.8701,
            evidence_ids=[
                "ev_combo_baseline",
                "ev_combo_provider_control",
                "ev_combo_country_control",
            ],
            counterfactual_check="Otros providers en BR y NovaPay fuera de BR estan saludables.",
        ),
        IncidentCandidate(
            candidate_id="cand_combo_competitor",
            anomaly_id=anomaly_id,
            dimensions=Dimensions(provider="nova_pay", merchant="TiendaNorte"),
            confidence=0.6812,
            affected_count=24,
            baseline_decline_rate=0.10,
            current_decline_rate=0.40,
            estimated_revenue_loss_usd_per_hour=8_000,
            rca_score=0.7480,
            evidence_ids=["ev_combo_competitor", "ev_combo_merchant_control"],
            counterfactual_check="Otros merchants con NovaPay estan saludables.",
        ),
        IncidentCandidate(
            candidate_id="cand_combo_provider",
            anomaly_id=anomaly_id,
            dimensions=Dimensions(provider="nova_pay"),
            confidence=0.52,
            affected_count=50,
            baseline_decline_rate=0.10,
            current_decline_rate=0.25,
            estimated_revenue_loss_usd_per_hour=6_000,
            rca_score=0.52,
            evidence_ids=["ev_combo_provider"],
        ),
        IncidentCandidate(
            candidate_id="cand_combo_country",
            anomaly_id=anomaly_id,
            dimensions=Dimensions(country="BR"),
            confidence=0.45,
            affected_count=40,
            baseline_decline_rate=0.10,
            current_decline_rate=0.20,
            estimated_revenue_loss_usd_per_hour=4_000,
            rca_score=0.30,
            evidence_ids=["ev_combo_country"],
        ),
    )

    result = run_investigation(anomaly_id, candidates, evidence)

    assert result.report.status in {ReportStatus.confirmed, ReportStatus.probable}
    assert result.report.winning_candidate_id == "cand_combo_root"
    assert {"ev_combo_provider_control", "ev_combo_country_control"} <= (
        result.consulted_evidence_ids
    )


def test_high_confidence_low_volume_candidate_remains_inconclusive() -> None:
    anomaly_id = "anom_low_volume"
    evidence = (
        Evidence(
            evidence_id="ev_low_volume",
            source="baseline_comparison",
            summary="NovaPay: 5 rechazos en solo 10 intentos.",
            value=0.40,
            dimension_key="provider=nova_pay",
        ),
    )
    candidates = (
        IncidentCandidate(
            candidate_id="cand_low_volume",
            anomaly_id=anomaly_id,
            dimensions=Dimensions(provider="nova_pay"),
            confidence=0.95,
            affected_count=5,
            baseline_decline_rate=0.10,
            current_decline_rate=0.50,
            estimated_revenue_loss_usd_per_hour=800,
            rca_score=0.90,
            evidence_ids=["ev_low_volume"],
        ),
    )

    result = run_investigation(anomaly_id, candidates, evidence)

    assert result.report.status is ReportStatus.inconclusive
    assert result.report.winning_candidate_id is None


def test_more_specific_candidate_requires_incremental_evidence() -> None:
    evidence = (
        Evidence(
            evidence_id="ev_merchant",
            source="baseline_comparison",
            summary="Comercio2: rechazo subio de 10% a 48%.",
            value=0.38,
            dimension_key="merchant=Comercio2",
        ),
        Evidence(
            evidence_id="ev_merchant_stripe",
            source="baseline_comparison",
            summary="Comercio2 con stripe: rechazo subio de 10% a 49%.",
            value=0.39,
            dimension_key="merchant=Comercio2|provider=stripe",
        ),
        Evidence(
            evidence_id="ev_provider_control",
            source="counterfactual_provider",
            summary="Otro provider del merchant mantiene un desempeno comparable.",
            value=0.50,
            dimension_key="merchant=Comercio2|provider=stripe",
        ),
    )
    candidates = (
        IncidentCandidate(
            candidate_id="cand_merchant_stripe",
            anomaly_id="anom_merchant",
            dimensions=Dimensions(merchant="Comercio2", provider="stripe"),
            confidence=0.94,
            affected_count=100,
            baseline_decline_rate=0.10,
            current_decline_rate=0.49,
            estimated_revenue_loss_usd_per_hour=12_500,
            rca_score=0.95,
            evidence_ids=["ev_merchant_stripe", "ev_provider_control"],
            counterfactual_check="Se compararon providers dentro del merchant.",
        ),
        IncidentCandidate(
            candidate_id="cand_merchant",
            anomaly_id="anom_merchant",
            dimensions=Dimensions(merchant="Comercio2"),
            confidence=0.91,
            affected_count=210,
            baseline_decline_rate=0.10,
            current_decline_rate=0.48,
            estimated_revenue_loss_usd_per_hour=12_000,
            rca_score=0.80,
            evidence_ids=["ev_merchant"],
        ),
    )

    result = run_investigation("anom_merchant", candidates, evidence)

    assert result.report.status in {ReportStatus.confirmed, ReportStatus.probable}
    assert result.report.winning_candidate_id == "cand_merchant"
    assert "provider=stripe" not in result.report.summary


def test_true_two_dimension_incident_remains_publishable() -> None:
    case = clear_provider_country_case()

    result = run_investigation(case.anomaly_id, case.candidates, case.evidence)

    assert result.report.winning_candidate_id == "cand_novapay_br"
    assert {"ev_clear_control", "ev_clear_country_control"} <= (
        result.consulted_evidence_ids
    )


def test_ambiguous_case_abstains_without_winner() -> None:
    case = ambiguous_provider_issuer_case()
    result = run_investigation(case.anomaly_id, case.candidates, case.evidence)

    assert result.report.status == ReportStatus.inconclusive
    assert result.report.winning_candidate_id is None
    assert "no permite separar" in result.report.summary
    assert result.consulted_evidence_ids == {"ev_amb_provider", "ev_amb_issuer"}


def test_no_candidate_case_is_inconclusive_without_fabricating_claims() -> None:
    case = no_candidate_case()
    result = run_investigation(case.anomaly_id, case.candidates, case.evidence)

    assert result.report.status == ReportStatus.inconclusive
    assert result.report.winning_candidate_id is None
    assert result.report.claims == []
    assert report_loss_per_hour(result.report) == 0.0


def test_validator_rejects_unknown_evidence() -> None:
    case = clear_provider_country_case()
    result = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    invalid_report = result.report.model_copy(deep=True)
    invalid_report.claims = [
        Claim(claim="Una afirmacion inventada.", evidence_ids=["ev_does_not_exist"], confidence=0.9)
    ]

    with pytest.raises(ReportValidationError, match="unknown evidence"):
        validate_report(
            invalid_report,
            candidates=case.candidates,
            evidence=case.evidence,
            steps=result.steps,
            consulted_evidence_ids=result.consulted_evidence_ids,
        )


def test_validator_rejects_evidence_that_was_not_consulted() -> None:
    case = clear_provider_country_case()
    result = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    invalid_report = result.report.model_copy(deep=True)
    unconsulted = Evidence(
        evidence_id="ev_unconsulted",
        source="baseline_comparison",
        summary="Evidencia valida que ninguna candidata consultada referencia.",
        value=0.01,
        dimension_key="provider=nova_pay",
    )
    invalid_report.claims[0].evidence_ids = [unconsulted.evidence_id]

    with pytest.raises(ReportValidationError, match="not consulted"):
        validate_report(
            invalid_report,
            candidates=case.candidates,
            evidence=(*case.evidence, unconsulted),
            steps=result.steps,
            consulted_evidence_ids=result.consulted_evidence_ids,
        )


def test_validator_rejects_an_ungrounded_technical_entity_name() -> None:
    case = clear_provider_country_case()
    result = run_investigation(case.anomaly_id, case.candidates, case.evidence)
    invalid_report = result.report.model_copy(deep=True)
    invalid_report.summary = "La alternativa nueva_pay no explica el incidente."

    with pytest.raises(ReportValidationError, match="ungrounded entity tokens: nueva_pay"):
        validate_report(
            invalid_report,
            candidates=case.candidates,
            evidence=case.evidence,
            steps=result.steps,
            consulted_evidence_ids=result.consulted_evidence_ids,
        )


def test_tools_return_detached_data_and_reject_foreign_ids() -> None:
    case = clear_provider_country_case()
    tools = ReadOnlyInvestigationTools(case.anomaly_id, case.candidates, case.evidence)
    first_result = tools.rank_candidates()
    first_result[0]["confidence"] = 0.0

    second_result = tools.rank_candidates()
    assert second_result[0]["confidence"] == 0.93

    with pytest.raises(ToolLookupError, match="Unknown candidate_id"):
        tools.get_candidate_evidence("cand_foreign")


def test_report_references_every_visible_step_in_order() -> None:
    case = clear_provider_country_case()
    result = run_investigation(case.anomaly_id, case.candidates, case.evidence)

    assert result.report.investigation_steps == [step.step_id for step in result.steps]


def test_tool_budget_stops_runaway_investigations() -> None:
    case = clear_provider_country_case()
    tools = ReadOnlyInvestigationTools(
        case.anomaly_id,
        case.candidates,
        case.evidence,
        max_tool_calls=2,
    )

    tools.rank_candidates()
    tools.compare_top_candidates()
    with pytest.raises(ToolBudgetExceeded, match="2-call tool budget"):
        tools.get_financial_impact("cand_novapay_br")
