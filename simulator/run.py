"""Smoke test manual del simulador: ``uv run python simulator/run.py``."""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

# Permite ejecutar el smoke test exactamente como indica AGENTS.md:
# ``uv run python simulator/run.py``. Al correr un archivo por ruta, Python pone
# ``simulator/`` (no la raíz del repositorio) en sys.path.
if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from contracts.schemas import Dimensions
from simulator import PaymentSimulator


def main() -> None:
    start = datetime.now(timezone.utc).replace(microsecond=0)
    simulator = PaymentSimulator(seed=42)
    simulator.chaos.inject_manual(
        Dimensions(provider="nova_pay", country="BR"),
        severity_pp=35,
        started_at=start,
        duration_minutes=3,
    )
    transactions = simulator.generate(start, count=10, interval_seconds=1)
    approved = sum(transaction.approved for transaction in transactions)
    print(f"Generadas {len(transactions)} transacciones; aprobadas: {approved}.")
    print("Chaos activo:", simulator.chaos.public_spec().model_dump(mode="json"))


if __name__ == "__main__":
    main()
