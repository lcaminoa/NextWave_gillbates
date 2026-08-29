"""API-local envelopes around the frozen shared contract entities.

These models do not add fields to the eight shared entities in ``contracts/``. They only
describe request bodies and the incident-detail envelope for the frozen HTTP routes.
"""

from __future__ import annotations

import math

from pydantic import BaseModel, ConfigDict, Field, field_validator

from contracts.schemas import Evidence, IncidentCandidate, IncidentReport, InvestigationStep


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


class IncidentDetail(ApiModel):
    report: IncidentReport
    candidates: list[IncidentCandidate]
    evidence: list[Evidence]
    investigation_steps: list[InvestigationStep]
