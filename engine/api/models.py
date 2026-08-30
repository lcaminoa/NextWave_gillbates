"""API-local envelopes around the frozen shared contract entities.

These models do not add fields to the eight shared entities in ``contracts/``. They only
describe request bodies and the incident-detail envelope for the frozen HTTP routes.
"""

from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from contracts.schemas import (
    ChaosSpec,
    Evidence,
    IncidentCandidate,
    IncidentReport,
    InvestigationStep,
)
from engine.investigator import AuditIssue


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HealthResponse(ApiModel):
    status: str


class ChaosRandomRequest(ApiModel):
    severity_pp: float
    duration_minutes: int | None = Field(default=None, gt=0, le=60)

    @field_validator("severity_pp")
    @classmethod
    def validate_severity(cls, value: float) -> float:
        if not math.isfinite(value) or not 0 < abs(value) <= 95:
            raise ValueError("severity_pp must be finite and between 1 and 95")
        return value


class ChaosRevealRequest(ApiModel):
    chaos_id: str | None = None


AuditStatus = Literal["approved", "rejected", "error", "not_run"]
AuditCheckStatus = Literal["pass", "fail", "not_applicable"]


class EvidenceAuditCheck(ApiModel):
    code: str = Field(min_length=1)
    label: str = Field(min_length=1)
    status: AuditCheckStatus
    detail: str = Field(min_length=1)


class EvidenceAuditView(ApiModel):
    status: AuditStatus
    summary: str = Field(min_length=1)
    issues: list[AuditIssue] = Field(default_factory=list)
    claims_reviewed: int = Field(ge=0)
    evidence_reviewed: int = Field(ge=0)
    requires_human_review: Literal[True] = True
    action_executed: Literal[False] = False
    checks: list[EvidenceAuditCheck]


class IncidentDetail(ApiModel):
    report: IncidentReport
    candidates: list[IncidentCandidate]
    evidence: list[Evidence]
    investigation_steps: list[InvestigationStep]
    evidence_audit: EvidenceAuditView


BlindTrialOutcome = Literal[
    "exact",
    "partial",
    "over_specific",
    "mixed",
    "incorrect",
    "inconclusive",
    "no_report",
    "ambiguous",
]
AbstentionAssessment = Literal["justified", "unverified", "not_applicable"]


class DimensionConflict(ApiModel):
    truth: str
    diagnosed: str


class BlindTrialEvaluation(ApiModel):
    chaos_id: str
    incident_id: str | None = None
    outcome: BlindTrialOutcome
    truth_dimensions: dict[str, str]
    diagnosed_dimensions: dict[str, str]
    matching_dimensions: dict[str, str]
    missing_dimensions: dict[str, str]
    extra_dimensions: dict[str, str]
    conflicting_dimensions: dict[str, DimensionConflict]
    injected_degradation_pp: float = Field(ge=0)
    estimated_degradation_pp: float | None = Field(default=None, ge=0)
    severity_error_pp: float | None = Field(default=None, ge=0)
    detection_latency_seconds: float | None = Field(default=None, ge=0)
    explanation_latency_seconds: float | None = Field(default=None, ge=0)
    investigation_latency_seconds: float | None = Field(default=None, ge=0)
    structural_evidence_valid: bool
    evidence_audit_status: AuditStatus
    abstention_assessment: AbstentionAssessment
    human_review_required: Literal[True] = True
    action_executed: Literal[False] = False


class ChaosRevealResponse(ChaosSpec):
    """API-local reveal envelope that preserves every existing ChaosSpec field."""

    evaluation: BlindTrialEvaluation | None = None
