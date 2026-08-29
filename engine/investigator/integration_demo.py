"""Stream B -> Stream C smoke demo using Lautaro's current deterministic engine.

Run with: uv run python -m engine.investigator.integration_demo
"""

from __future__ import annotations

from datetime import datetime, timedelta

from engine.detection.anomaly import detect
from engine.detection.mock_generator import generate_stream, make_chaos
from engine.investigator.runner import run_investigation
from engine.rootcause.candidates import generate_candidates

SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def main() -> None:
    start = datetime(2026, 8, 29, 14, 0, 0)
    history = generate_stream(start, n=1500, interval_seconds=1.0, seed=1)
    quiet_start = start + timedelta(seconds=1500)
    quiet_window = generate_stream(quiet_start, n=300, interval_seconds=1.0, seed=2)

    chaos = make_chaos(
        provider="nova_pay",
        country="BR",
        severity_pp=45.0,
        started_at=quiet_window[-1].timestamp,
        mode="manual",
    )
    chaos_window = generate_stream(
        chaos.started_at,
        n=500,
        interval_seconds=1.0,
        chaos=chaos,
        seed=3,
    )
    half = len(chaos_window) // 2
    persistence_state: dict[str, int] = {}
    detect(
        history + quiet_window,
        chaos_window[:half],
        chaos.started_at,
        chaos_window[half - 1].timestamp,
        persistence_state,
    )
    anomalies = detect(
        history + quiet_window,
        chaos_window[half:],
        chaos_window[half].timestamp,
        chaos_window[-1].timestamp,
        persistence_state,
    )
    if not anomalies:
        raise RuntimeError("Stream B did not detect the deterministic chaos scenario")

    anomaly = max(anomalies, key=lambda item: SEVERITY_RANK[item.severity.value])
    window_minutes = (
        chaos_window[-1].timestamp - chaos_window[half].timestamp
    ).total_seconds() / 60.0
    candidates, evidence = generate_candidates(
        anomaly_id=anomaly.anomaly_id,
        history=history + quiet_window,
        current_window=chaos_window[half:],
        anomaly_window_minutes=window_minutes,
    )
    result = run_investigation(anomaly.anomaly_id, candidates, evidence)

    print("=== Stream B -> Stream C ===")
    print(f"anomaly: {anomaly.dimension_key} ({anomaly.severity.value})")
    print(f"candidates: {len(candidates)} | evidence: {len(evidence)}")
    for step in result.steps:
        print(f"- {step.result_summary}")
    print(f"status: {result.report.status.value}")
    print(f"winner: {result.report.winning_candidate_id}")
    print(f"summary: {result.report.summary}")


if __name__ == "__main__":
    main()
