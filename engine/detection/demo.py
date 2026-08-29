"""Demo end-to-end de Stream B contra datos mock, sin esperar al simulador real de Stream A.

Ejecutar con:  uv run python -m engine.detection.demo

Genera trafico normal, confirma que no dispara falsas alarmas, despues inyecta un chaos
(NovaPay x Brasil degradado) y confirma que la deteccion + RCA + descomposicion de mezcla lo
encuentran solos.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from engine.detection import mock_generator
from engine.detection.anomaly import DetectionState, detect
from engine.detection.config import DetectionConfig
from engine.detection.mix_shift import decompose
from engine.rootcause.candidates import generate_candidates

SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def _minutes(start: datetime, end: datetime) -> float:
    return (end - start).total_seconds() / 60.0


def main() -> None:
    start = datetime(2026, 8, 29, 14, 0, 0)

    print("=== 1) Trafico normal (sin chaos) ===")
    history = mock_generator.generate_stream(start, n=1500, interval_seconds=1.0, seed=1)
    quiet_start = start + timedelta(seconds=1500)
    quiet_window = mock_generator.generate_stream(quiet_start, n=300, interval_seconds=1.0, seed=2)
    quiet_end = quiet_window[-1].timestamp

    # La demo usa dos ventanas largas para terminar rápido; el runtime conserva el
    # default más robusto de tres ventanas mediante DetectionConfig().
    # ewma_lambda mas alto (0.7 en vez del default 0.3) porque con solo 2 ventanas el EWMA
    # no llega a "calentar" a tiempo con el lambda por defecto y la demo no detecta nada
    # (ver DECISIONS.md D006) -- el default de config.py queda como esta para produccion,
    # donde hay muchas mas ventanas reales para que el suavizado tenga sentido.
    demo_config = DetectionConfig(persistence_windows=2, ewma_lambda=0.7)
    detector_state = DetectionState()
    anomalies = detect(
        history, quiet_window, quiet_start, quiet_end, detector_state, demo_config,
    )
    print(f"historicas: {len(history)} | ventana actual: {len(quiet_window)}")
    print(f"anomalias detectadas (deberia ser ~0): {len(anomalies)}")
    for a in anomalies:
        print(f"  ! {a.dimension_key}: observado {a.observed_approval_rate:.1%} vs esperado {a.expected_approval_rate:.1%} ({a.severity.value})")

    print("\n=== 2) Chaos: NovaPay x Brasil degradado -45pp ===")
    chaos = mock_generator.make_chaos(provider="nova_pay", country="BR", severity_pp=45.0, started_at=quiet_end, mode="manual")
    chaos_window = mock_generator.generate_stream(chaos.started_at, n=500, interval_seconds=1.0, chaos=chaos, seed=3)
    chaos_end = chaos_window[-1].timestamp

    # Se llama detect() dos veces (primera mitad, segunda mitad) para simular dos
    # ventanas consecutivas y alcanzar la persistencia configurada para esta demo.
    half = len(chaos_window) // 2
    detect(
        history + quiet_window,
        chaos_window[:half],
        chaos.started_at,
        chaos_window[half - 1].timestamp,
        detector_state,
        demo_config,
    )
    anomalies = detect(
        history + quiet_window,
        chaos_window[half:],
        chaos_window[half].timestamp,
        chaos_end,
        detector_state,
        demo_config,
    )

    print(f"anomalias detectadas: {len(anomalies)}")
    for a in anomalies:
        print(f"  - {a.dimension_key}: observado {a.observed_approval_rate:.1%} vs esperado {a.expected_approval_rate:.1%} ({a.severity.value}, {a.persistence_windows} ventanas sostenidas)")

    if not anomalies:
        print("(no se detecto nada -- revisar umbrales / severity_pp)")
        return

    target = max(anomalies, key=lambda a: SEVERITY_RANK[a.severity.value])
    print(f"\n=== 3) RCA sobre la anomalia mas severa: {target.dimension_key} ===")
    candidates, evidence = generate_candidates(
        anomaly_id=target.anomaly_id,
        history=history + quiet_window,
        current_window=chaos_window[half:],
        anomaly_window_minutes=_minutes(chaos_window[half].timestamp, chaos_end),
    )
    print(f"candidatos generados: {len(candidates)} | evidencia: {len(evidence)}")
    for c in candidates[:3]:
        dims = c.dimensions.model_dump(exclude_none=True)
        print(f"  candidato {dims} | rca_score={c.rca_score} | confianza={c.confidence:.0%} | perdida est. USD {c.estimated_revenue_loss_usd_per_hour}/h | codigo dominante: {c.dominant_decline_code}")
        if c.counterfactual_check:
            print(f"    contrafactico: {c.counterfactual_check}")

    print("\n=== 4) Descomposicion de mezcla (control: no deberia explicar la caida) ===")
    mix_pp, perf_pp = decompose(quiet_window, chaos_window[half:], dimension="country")
    print(f"  efecto de mezcla: {mix_pp} pp | efecto real de rendimiento: {perf_pp} pp")
    print("  (si el efecto de mezcla es chico y el de rendimiento es grande, confirma que es un incidente real, no ruido de composicion)")


if __name__ == "__main__":
    main()
