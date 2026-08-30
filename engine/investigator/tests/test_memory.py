from __future__ import annotations

from datetime import datetime, timedelta, timezone

from contracts.schemas import Anomaly, Dimensions, ReportStatus, Severity
from engine.investigator.memory import SQLiteIncidentMemory
from engine.investigator.mock_data import clear_provider_country_case, no_candidate_case
from engine.investigator.runner import run_investigation


START = datetime(2026, 8, 29, 14, 0, tzinfo=timezone.utc)


def _anomaly(anomaly_id: str, *, hour_offset: int = 0) -> Anomaly:
    start = START + timedelta(hours=hour_offset)
    return Anomaly(
        anomaly_id=anomaly_id,
        detected_at=start + timedelta(minutes=3),
        dimension_key="country=BR|provider=nova_pay",
        window_start=start + timedelta(minutes=2),
        window_end=start + timedelta(minutes=3),
        observed_approval_rate=0.55,
        expected_approval_rate=0.9,
        persistence_windows=3,
        volume=120,
        severity=Severity.critical,
    )


def _resolved_case(anomaly_id: str):
    case = clear_provider_country_case()
    candidates = tuple(
        item.model_copy(
            update={
                "anomaly_id": anomaly_id,
                "candidate_id": item.candidate_id.replace(case.anomaly_id, anomaly_id),
            }
        )
        for item in case.candidates
    )
    report = run_investigation(anomaly_id, candidates, case.evidence).report
    assert report.status in {ReportStatus.confirmed, ReportStatus.probable}
    return _anomaly(anomaly_id), report, candidates, case.evidence


def test_sqlite_memory_persists_a_resolved_root_and_finds_a_strict_recurrence(tmp_path) -> None:
    database = tmp_path / "incident-memory.sqlite3"
    old_anomaly, old_report, old_candidates, _ = _resolved_case("anom_previous")
    memory = SQLiteIncidentMemory(database)

    assert memory.record_resolved(old_anomaly, old_report, old_candidates) is True
    assert memory.count == 1

    current_anomaly, current_report, current_candidates, _ = _resolved_case("anom_recurrence")
    match = memory.find_similar(current_anomaly, current_report, current_candidates)

    assert match is not None
    assert match.incident_id == old_report.incident_id
    assert match.similarity >= 0.85

    reopened = SQLiteIncidentMemory(database)
    persisted_match = reopened.find_similar(
        current_anomaly,
        current_report,
        current_candidates,
    )
    assert persisted_match is not None
    assert persisted_match.incident_id == old_report.incident_id


def test_memory_rejects_a_conflicting_decline_mechanism_even_when_dimensions_match() -> None:
    old_anomaly, old_report, old_candidates, _ = _resolved_case("anom_previous")
    old_candidates = tuple(
        item.model_copy(update={"dominant_decline_code": "provider_timeout"})
        for item in old_candidates
    )
    memory = SQLiteIncidentMemory()
    assert memory.record_resolved(old_anomaly, old_report, old_candidates) is True

    current_anomaly, current_report, current_candidates, _ = _resolved_case("anom_new_code")
    changed_code_candidates = tuple(
        item.model_copy(update={"dominant_decline_code": "issuer_unavailable"})
        for item in current_candidates
    )

    assert memory.find_similar(
        current_anomaly,
        current_report,
        changed_code_candidates,
    ) is None


def test_memory_never_stores_an_inconclusive_report() -> None:
    case = no_candidate_case()
    report = run_investigation(case.anomaly_id, case.candidates, case.evidence).report
    memory = SQLiteIncidentMemory()

    assert report.status is ReportStatus.inconclusive
    assert memory.record_resolved(_anomaly(case.anomaly_id), report, case.candidates) is False
    assert memory.count == 0


def test_memory_rejects_a_different_root_even_when_the_decline_shape_matches() -> None:
    old_anomaly, old_report, old_candidates, _ = _resolved_case("anom_previous")
    memory = SQLiteIncidentMemory()
    assert memory.record_resolved(old_anomaly, old_report, old_candidates) is True

    current_anomaly, current_report, current_candidates, _ = _resolved_case("anom_other_root")
    different_root = tuple(
        item.model_copy(update={"dimensions": Dimensions(provider="stripe", country="BR")})
        for item in current_candidates
    )

    assert memory.find_similar(
        current_anomaly,
        current_report,
        different_root,
    ) is None
