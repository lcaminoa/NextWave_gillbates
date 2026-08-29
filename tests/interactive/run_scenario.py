"""Ensayo manual de un incidente sintético contra el detector y RCA.

No empieza con una respuesta hardcodeada: la verdad queda en ``ChaosSpec`` y el
resultado impreso se obtiene de las transacciones generadas.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta

from engine.detection.anomaly import DetectionState, detect
from engine.detection.config import DetectionConfig
from engine.detection.mock_generator import generate_stream, make_chaos
from engine.rootcause.candidates import generate_candidates


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Probar una inyeccion de caos manual")
    parser.add_argument("--normal", action="store_true", help="No inyectar incidente")
    parser.add_argument("--provider", default="nova_pay")
    parser.add_argument("--country", default="BR")
    parser.add_argument("--payment-method", default=None)
    parser.add_argument("--issuing-bank", default=None)
    parser.add_argument("--merchant", default=None)
    parser.add_argument("--severity-pp", type=float, default=35.0)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start = datetime(2026, 8, 29, 14, 0, 0)
    history = generate_stream(start - timedelta(minutes=20), n=6_000, interval_seconds=0.2, seed=args.seed)
    config = DetectionConfig(persistence_windows=3)
    state = DetectionState()

    chaos = None
    if not args.normal:
        chaos = make_chaos(
            provider=args.provider,
            country=args.country,
            payment_method=args.payment_method,
            issuing_bank=args.issuing_bank,
            merchant=args.merchant,
            severity_pp=args.severity_pp,
            started_at=start,
        )

    print("=== Escenario ===")
    print("normal" if args.normal else chaos.dimensions.model_dump(exclude_none=True))
    print("=== Ventanas evaluadas ===")

    latest_window: list = []
    anomalies = []
    for minute in range(3):
        window_start = start + timedelta(minutes=minute)
        latest_window = generate_stream(
            window_start, n=600, interval_seconds=0.1, chaos=chaos, seed=args.seed + minute + 1,
        )
        anomalies = detect(
            history,
            latest_window,
            window_start,
            window_start + timedelta(minutes=1),
            state,
            config,
        )
        print(f"minuto {minute + 1}: {len(anomalies)} anomalias confirmadas")

    if not anomalies:
        print("Resultado: sin anomalias confirmadas.")
        return

    target = max(anomalies, key=lambda anomaly: anomaly.persistence_windows)
    candidates, evidence = generate_candidates(
        target.anomaly_id,
        history,
        latest_window,
        anomaly_window_minutes=1,
        config=config,
    )
    print(f"\nAnomalia: {target.dimension_key} ({target.severity.value})")
    for candidate in candidates[:3]:
        print(
            f"  {candidate.dimensions.model_dump(exclude_none=True)} | "
            f"score={candidate.rca_score} | confianza={candidate.confidence:.0%} | "
            f"USD {candidate.estimated_revenue_loss_usd_per_hour}/h"
        )
    print(f"Evidencias generadas: {len(evidence)}")


if __name__ == "__main__":
    main()
