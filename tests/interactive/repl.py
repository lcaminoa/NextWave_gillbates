"""Consola manual para calibrar el detector contra caos sintético.

Ejecutar con: ``uv run python -m tests.interactive.repl``.
Cada ``run`` genera una historia limpia y ventanas nuevas, de modo que cambiar
parámetros permite comparar escenarios reproducibles sin estado residual.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from engine.detection.anomaly import DetectionState, detect
from engine.detection.config import DetectionConfig
from engine.detection.mock_generator import generate_stream, make_chaos
from engine.rootcause.candidates import generate_candidates


ALLOWED_DIMENSIONS = {
    "provider", "country", "payment_method", "issuing_bank", "merchant",
}


@dataclass
class Scenario:
    transactions_per_minute: int = 1_200
    severity_pp: float = 35.0
    minutes: int = 3
    seed: int = 42
    normal: bool = False
    dimensions: dict[str, str] | None = None

    def __post_init__(self) -> None:
        if self.dimensions is None:
            self.dimensions = {"provider": "nova_pay", "country": "BR"}


def _print_scenario(scenario: Scenario) -> None:
    print("\n=== Configuracion actual ===")
    print(f"trafico: {scenario.transactions_per_minute} tx/min")
    print(f"duracion: {scenario.minutes} ventanas")
    print(f"severidad: -{scenario.severity_pp} pp")
    print("modo: normal" if scenario.normal else f"incidente: {scenario.dimensions}")


def _run(scenario: Scenario) -> None:
    start = datetime(2026, 8, 29, 14, 0, 0)
    interval_seconds = 60 / scenario.transactions_per_minute
    history = generate_stream(
        start - timedelta(minutes=20),
        n=scenario.transactions_per_minute * 20,
        interval_seconds=interval_seconds,
        seed=scenario.seed,
    )
    config = DetectionConfig(persistence_windows=3)
    state = DetectionState()
    chaos = None
    if not scenario.normal:
        chaos = make_chaos(
            severity_pp=scenario.severity_pp,
            started_at=start,
            **scenario.dimensions,
        )

    latest_window = []
    anomalies = []
    print("\n=== Resultado por ventana ===")
    for minute in range(scenario.minutes):
        window_start = start + timedelta(minutes=minute)
        latest_window = generate_stream(
            window_start,
            n=scenario.transactions_per_minute,
            interval_seconds=interval_seconds,
            chaos=chaos,
            seed=scenario.seed + minute + 1,
        )
        anomalies = detect(
            history,
            latest_window,
            window_start,
            window_start + timedelta(minutes=1),
            state,
            config,
        )
        names = ", ".join(anomaly.dimension_key for anomaly in anomalies) or "ninguna"
        print(f"ventana {minute + 1}: {len(anomalies)} confirmadas ({names})")

    if not anomalies:
        print("\nResultado final: sin anomalias confirmadas.")
        return

    target = max(anomalies, key=lambda anomaly: (anomaly.persistence_windows, anomaly.volume))
    candidates, evidence = generate_candidates(
        target.anomaly_id,
        history,
        latest_window,
        anomaly_window_minutes=1,
        config=config,
    )
    print(f"\nAnomalia elegida para RCA: {target.dimension_key} ({target.severity.value})")
    for candidate in candidates[:3]:
        print(
            f"  {candidate.dimensions.model_dump(exclude_none=True)} | "
            f"score={candidate.rca_score} | confianza={candidate.confidence:.0%} | "
            f"USD {candidate.estimated_revenue_loss_usd_per_hour}/h"
        )
    print(f"Evidencias generadas: {len(evidence)}")


def _set_value(scenario: Scenario, command: str) -> None:
    _, field, value = command.split(maxsplit=2)
    if field == "rate":
        scenario.transactions_per_minute = int(value)
    elif field == "severity":
        scenario.severity_pp = float(value)
    elif field == "minutes":
        scenario.minutes = int(value)
    elif field == "seed":
        scenario.seed = int(value)
    else:
        raise ValueError("usa: set rate|severity|minutes|seed VALOR")
    if scenario.transactions_per_minute <= 0 or scenario.minutes <= 0:
        raise ValueError("rate y minutes deben ser mayores a cero")


def _inject(scenario: Scenario, command: str) -> None:
    dimensions: dict[str, str] = {}
    for assignment in command.split()[1:]:
        key, separator, value = assignment.partition("=")
        if not separator or key not in ALLOWED_DIMENSIONS or not value:
            raise ValueError("usa: inject provider=nova_pay country=BR [issuing_bank=itau]")
        dimensions[key] = value
    if not dimensions:
        raise ValueError("inject requiere al menos una dimension")
    scenario.dimensions = dimensions
    scenario.normal = False


def main() -> None:
    scenario = Scenario()
    print("Control Tower detection REPL. Escribi 'help' para ver comandos.")
    _print_scenario(scenario)

    while True:
        try:
            command = input("detection> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nSaliendo.")
            return

        if command in {"quit", "exit"}:
            return
        if command == "help":
            print("show | run | normal | inject clave=valor [...] | set rate|severity|minutes|seed VALOR | quit")
            continue
        if command == "show":
            _print_scenario(scenario)
            continue
        if command == "normal":
            scenario.normal = True
            continue
        if command == "run":
            _run(scenario)
            continue
        try:
            if command.startswith("set "):
                _set_value(scenario, command)
            elif command.startswith("inject "):
                _inject(scenario, command)
            elif command:
                print("Comando desconocido. Escribi 'help'.")
        except (ValueError, IndexError) as error:
            print(f"Error: {error}")


if __name__ == "__main__":
    main()
