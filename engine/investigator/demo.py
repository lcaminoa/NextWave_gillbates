"""Human-readable Stage 1 demo. Run with: uv run python -m engine.investigator.demo."""

from __future__ import annotations

from engine.investigator.mock_data import (
    ambiguous_provider_issuer_case,
    clear_provider_country_case,
    no_candidate_case,
)
from engine.investigator.runner import run_investigation


def main() -> None:
    for case in (
        clear_provider_country_case(),
        ambiguous_provider_issuer_case(),
        no_candidate_case(),
    ):
        result = run_investigation(case.anomaly_id, case.candidates, case.evidence)
        print(f"\n=== {case.name} ===")
        for step in result.steps:
            print(f"- {step.action}: {step.result_summary}")
        print(f"estado: {result.report.status.value}")
        print(f"resumen: {result.report.summary}")
        print(f"evidencia consultada: {sorted(result.consulted_evidence_ids)}")
        print(f"accion: {result.report.recommended_action}")


if __name__ == "__main__":
    main()
