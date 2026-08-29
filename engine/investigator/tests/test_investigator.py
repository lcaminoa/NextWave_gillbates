from __future__ import annotations

import pytest

from contracts.schemas import Claim, ReportStatus
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


def test_clear_case_produces_confirmed_evidence_backed_report() -> None:
    case = clear_provider_country_case()
    result = run_investigation(case.anomaly_id, case.candidates, case.evidence)

    assert result.report.status == ReportStatus.confirmed
    assert result.report.winning_candidate_id == "cand_novapay_br"
    assert result.report.requires_human_review is True
    assert result.report.claims
    assert len(result.steps) >= 5
    assert set(result.report.claims[0].evidence_ids) <= result.consulted_evidence_ids


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
    invalid_report.claims[0].evidence_ids = ["ev_country_baseline"]

    with pytest.raises(ReportValidationError, match="not consulted"):
        validate_report(
            invalid_report,
            candidates=case.candidates,
            evidence=case.evidence,
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
