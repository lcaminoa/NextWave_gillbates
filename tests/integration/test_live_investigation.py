"""Acceptance tests for the real simulator -> Stream B -> investigator path."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from contracts.schemas import Dimensions, ReportStatus
from engine.detection.pipeline import DetectionPipeline
from engine.investigator.runner import run_investigation
from simulator import PaymentSimulator


START = datetime(2026, 8, 29, 14, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    ("dimensions", "expected_key"),
    [
        (Dimensions(provider="nova_pay"), "provider=nova_pay"),
        (
            Dimensions(provider="nova_pay", country="BR"),
            "country=BR|provider=nova_pay",
        ),
        (Dimensions(merchant="Comercio2"), "merchant=Comercio2"),
        (Dimensions(issuing_bank="nubank"), "issuing_bank=nubank"),
    ],
    ids=["provider", "provider-country", "merchant", "issuing-bank"],
)
def test_real_35pp_incidents_publish_the_injected_root_cause(
    dimensions: Dimensions,
    expected_key: str,
) -> None:
    """Do not replace this with hand-built candidates: it protects judge injections."""
    history = PaymentSimulator(seed=100).generate(
        START - timedelta(hours=1), count=1_500, interval_seconds=0.2
    )
    live = PaymentSimulator(seed=200)
    live.chaos.inject_manual(
        dimensions,
        severity_pp=35,
        started_at=START,
        duration_minutes=4,
    )
    pipeline = DetectionPipeline(history=history)

    matching_diagnoses = []
    for transaction in live.generate(START, count=2_400, interval_seconds=0.1):
        for result in pipeline.ingest(transaction):
            matching_diagnoses.extend(
                diagnosis
                for diagnosis in result.diagnoses
                if diagnosis.anomaly.dimension_key == expected_key
            )

    assert matching_diagnoses, f"the real pipeline never detected {expected_key}"
    diagnosis = matching_diagnoses[0]
    result = run_investigation(
        diagnosis.anomaly.anomaly_id,
        diagnosis.candidates,
        diagnosis.evidence,
    )

    assert result.report.status in {ReportStatus.probable, ReportStatus.confirmed}
    assert result.report.winning_candidate_id is not None
    winning = next(
        candidate
        for candidate in diagnosis.candidates
        if candidate.candidate_id == result.report.winning_candidate_id
    )
    assert winning.dimensions.model_dump(exclude_none=True) == dimensions.model_dump(
        exclude_none=True
    )
