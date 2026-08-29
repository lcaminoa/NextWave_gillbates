from __future__ import annotations

import json
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

import pytest

from contracts.schemas import ReportStatus
from engine.investigator.mock_data import clear_provider_country_case
from engine.investigator.openai_runner import (
    AgentClaimDraft,
    AgentReportDraft,
    TOOL_DEFINITIONS,
    run_openai_investigation,
)
from engine.investigator.runner import report_loss_per_hour
from engine.investigator.validation import ReportValidationError


@dataclass(frozen=True)
class FakeCall:
    name: str
    arguments: str
    call_id: str
    type: str = "function_call"


class FakeResponses:
    def __init__(self, calls: list[FakeCall], draft: AgentReportDraft) -> None:
        self._calls = iter(calls)
        self._draft = draft
        self.create_requests: list[dict[str, Any]] = []
        self.parse_requests: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.create_requests.append(kwargs)
        return SimpleNamespace(output=[next(self._calls)])

    def parse(self, **kwargs: Any) -> SimpleNamespace:
        self.parse_requests.append(kwargs)
        return SimpleNamespace(output_parsed=self._draft)


def _call(index: int, name: str, **arguments: Any) -> FakeCall:
    return FakeCall(
        name=name,
        arguments=json.dumps(arguments),
        call_id=f"call_{index}",
    )


def _successful_calls() -> list[FakeCall]:
    return [
        _call(1, "rank_candidates", limit=5),
        _call(2, "get_candidate_evidence", candidate_id="cand_novapay_br"),
        _call(3, "get_candidate_evidence", candidate_id="cand_novapay"),
        _call(4, "compare_top_candidates"),
        _call(5, "get_financial_impact", candidate_id="cand_novapay_br"),
        _call(6, "finish_investigation"),
    ]


def _confirmed_draft(evidence_ids: list[str]) -> AgentReportDraft:
    return AgentReportDraft(
        status=ReportStatus.confirmed,
        winning_candidate_id="cand_novapay_br",
        summary="NovaPay en Brasil explica la degradacion observada.",
        claims=[
            AgentClaimDraft(
                claim="La degradacion esta aislada a NovaPay en Brasil.",
                evidence_ids=evidence_ids,
                confidence=0.93,
            )
        ],
        recommended_action="Revisar el routing con aprobacion humana.",
    )


def test_openai_runner_uses_tools_then_validates_structured_report() -> None:
    case = clear_provider_country_case()
    responses = FakeResponses(
        _successful_calls(),
        _confirmed_draft(["ev_clear_baseline", "ev_clear_control"]),
    )
    client = SimpleNamespace(responses=responses)

    result = run_openai_investigation(
        case.anomaly_id,
        case.candidates,
        case.evidence,
        model="test-model",
        client=client,
    )

    assert result.report.status == ReportStatus.confirmed
    assert result.report.winning_candidate_id == "cand_novapay_br"
    assert result.report.requires_human_review is True
    assert report_loss_per_hour(result.report) == 11220.0
    assert result.consulted_evidence_ids >= {"ev_clear_baseline", "ev_clear_control"}
    assert result.report.investigation_steps == [step.step_id for step in result.steps]
    assert len(responses.create_requests) == 6
    assert len(responses.parse_requests) == 1
    assert all(request["store"] is False for request in responses.create_requests)
    assert responses.parse_requests[0]["text_format"] is AgentReportDraft


def test_openai_runner_rejects_structured_claim_with_unconsulted_evidence() -> None:
    case = clear_provider_country_case()
    responses = FakeResponses(
        _successful_calls(),
        _confirmed_draft(["ev_country_baseline"]),
    )

    with pytest.raises(ReportValidationError, match="not consulted"):
        run_openai_investigation(
            case.anomaly_id,
            case.candidates,
            case.evidence,
            model="test-model",
            client=SimpleNamespace(responses=responses),
        )


def test_openai_runner_rejects_finishing_without_an_investigation() -> None:
    case = clear_provider_country_case()
    responses = FakeResponses(
        [_call(1, "finish_investigation")],
        AgentReportDraft(
            status=ReportStatus.inconclusive,
            winning_candidate_id=None,
            summary="No se pudo determinar una causa.",
            claims=[],
            recommended_action="Mantener revision humana.",
        ),
    )

    with pytest.raises(ReportValidationError, match="without ranking candidates"):
        run_openai_investigation(
            case.anomaly_id,
            case.candidates,
            case.evidence,
            model="test-model",
            client=SimpleNamespace(responses=responses),
        )


def test_tool_definitions_are_strict_and_read_only() -> None:
    names = {tool["name"] for tool in TOOL_DEFINITIONS}

    assert names == {
        "rank_candidates",
        "get_candidate_evidence",
        "compare_top_candidates",
        "get_financial_impact",
        "finish_investigation",
    }
    assert all(tool["strict"] is True for tool in TOOL_DEFINITIONS)
    assert all(tool["parameters"]["additionalProperties"] is False for tool in TOOL_DEFINITIONS)
