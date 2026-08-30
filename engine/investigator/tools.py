"""Read-only tools shared by the deterministic and OpenAI investigators.

The tools consume Stream B contract objects and return detached dictionaries. Callers cannot
mutate the source candidates/evidence. Evidence access is recorded so final claims can only cite
items the investigation actually inspected.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from contracts.schemas import Evidence, IncidentCandidate
from engine.investigator.specificity import is_strict_refinement


class ToolLookupError(LookupError):
    """Raised when a tool receives an identifier outside the current incident."""


class ToolBudgetExceeded(RuntimeError):
    """Raised when an investigation tries to exceed its bounded tool budget."""


@dataclass(frozen=True)
class ToolCallRecord:
    name: str
    arguments: tuple[tuple[str, object], ...]
    result_summary: str


class ReadOnlyInvestigationTools:
    """A small, auditable tool surface scoped to exactly one anomaly."""

    def __init__(
        self,
        anomaly_id: str,
        candidates: list[IncidentCandidate] | tuple[IncidentCandidate, ...],
        evidence: list[Evidence] | tuple[Evidence, ...],
        max_tool_calls: int = 8,
    ) -> None:
        if max_tool_calls < 1 or max_tool_calls > 50:
            raise ValueError("max_tool_calls must be between 1 and 50")
        self.anomaly_id = anomaly_id
        self.max_tool_calls = max_tool_calls
        self._candidates = tuple(candidate.model_copy(deep=True) for candidate in candidates)
        self._candidate_by_id = {candidate.candidate_id: candidate for candidate in self._candidates}
        self._evidence_by_id = {
            item.evidence_id: item.model_copy(deep=True) for item in evidence
        }
        self._consulted_evidence_ids: set[str] = set()
        self._call_records: list[ToolCallRecord] = []

        foreign_candidates = [
            candidate.candidate_id
            for candidate in self._candidates
            if candidate.anomaly_id != anomaly_id
        ]
        if foreign_candidates:
            raise ValueError(
                f"Candidates outside anomaly {anomaly_id}: {', '.join(foreign_candidates)}"
            )

    @property
    def consulted_evidence_ids(self) -> frozenset[str]:
        return frozenset(self._consulted_evidence_ids)

    @property
    def call_records(self) -> tuple[ToolCallRecord, ...]:
        return tuple(self._call_records)

    def _check_budget(self) -> None:
        if len(self._call_records) >= self.max_tool_calls:
            raise ToolBudgetExceeded(
                f"Investigation exceeded its {self.max_tool_calls}-call tool budget"
            )

    def _record(self, name: str, result_summary: str, **arguments: object) -> None:
        self._call_records.append(
            ToolCallRecord(
                name=name,
                arguments=tuple(sorted(arguments.items())),
                result_summary=result_summary,
            )
        )

    def rank_candidates(self, limit: int = 5) -> list[dict[str, Any]]:
        self._check_budget()
        if limit < 1 or limit > 20:
            raise ValueError("limit must be between 1 and 20")
        ranked = sorted(self._candidates, key=lambda candidate: candidate.rca_score, reverse=True)
        result = [candidate.model_dump(mode="json") for candidate in ranked[:limit]]
        self._record("rank_candidates", f"returned {len(result)} candidates", limit=limit)
        return result

    def get_candidate_evidence(self, candidate_id: str) -> list[dict[str, Any]]:
        self._check_budget()
        candidate = self._candidate_by_id.get(candidate_id)
        if candidate is None:
            raise ToolLookupError(f"Unknown candidate_id: {candidate_id}")

        unknown_ids = [
            evidence_id
            for evidence_id in candidate.evidence_ids
            if evidence_id not in self._evidence_by_id
        ]
        if unknown_ids:
            raise ToolLookupError(
                f"Candidate {candidate_id} references unknown evidence: {', '.join(unknown_ids)}"
            )

        self._consulted_evidence_ids.update(candidate.evidence_ids)
        result = [
            self._evidence_by_id[evidence_id].model_dump(mode="json")
            for evidence_id in candidate.evidence_ids
        ]
        self._record(
            "get_candidate_evidence",
            f"returned {len(result)} evidence items",
            candidate_id=candidate_id,
        )
        return result

    def compare_top_candidates(
        self,
        top_candidate_id: str | None = None,
    ) -> dict[str, Any]:
        """Compare a proposed winner with independent RCA alternatives.

        A more-specific child of the proposed winner is supporting detail, not
        a rival explanation.  Excluding those children avoids failing closed
        just because RCA also surfaced a narrow slice of the same incident.
        """
        self._check_budget()
        ranked = sorted(self._candidates, key=lambda candidate: candidate.rca_score, reverse=True)
        selected_top = (
            self._candidate_by_id.get(top_candidate_id)
            if top_candidate_id is not None
            else (ranked[0] if ranked else None)
        )
        if top_candidate_id is not None and selected_top is None:
            raise ToolLookupError(f"Unknown candidate_id: {top_candidate_id}")
        competitors = [
            candidate
            for candidate in ranked
            if selected_top is not None
            and candidate.candidate_id != selected_top.candidate_id
            and not is_strict_refinement(candidate, selected_top)
        ]
        runner_up = competitors[0] if competitors else None
        result: dict[str, Any] = {
            "candidate_count": len(ranked),
            "top_candidate": selected_top.model_dump(mode="json") if selected_top else None,
            "runner_up": runner_up.model_dump(mode="json") if runner_up else None,
            "confidence_margin": (
                round(selected_top.confidence - runner_up.confidence, 4)
                if selected_top is not None and runner_up is not None
                else (1.0 if selected_top is not None else 0.0)
            ),
            "score_margin": (
                round(selected_top.rca_score - runner_up.rca_score, 4)
                if selected_top is not None and runner_up is not None
                else (selected_top.rca_score if selected_top is not None else 0.0)
            ),
        }
        self._record(
            "compare_top_candidates",
            f"compared {1 + int(runner_up is not None)} independent candidates",
            top_candidate_id=top_candidate_id,
        )
        return result

    def get_financial_impact(self, candidate_id: str) -> dict[str, Any]:
        self._check_budget()
        candidate = self._candidate_by_id.get(candidate_id)
        if candidate is None:
            raise ToolLookupError(f"Unknown candidate_id: {candidate_id}")
        result = {
            "candidate_id": candidate_id,
            "estimated_revenue_loss_usd_per_hour": (
                candidate.estimated_revenue_loss_usd_per_hour
            ),
            "affected_count": candidate.affected_count,
        }
        self._record(
            "get_financial_impact",
            f"estimated USD {candidate.estimated_revenue_loss_usd_per_hour:.2f}/h",
            candidate_id=candidate_id,
        )
        return result
