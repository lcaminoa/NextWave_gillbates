"""
Deteccion secuencial de anomalias sobre el baseline (DECISIONS.md D001; master plan Sec 9.2).

Compara la aprobacion observada en una ventana reciente contra el baseline esperado del mismo
segmento, y solo levanta una Anomaly si la caida es real y se sostiene varias ventanas seguidas
-- no un pago rechazado suelto ni ruido de bajo volumen.

Revisa el agregado global Y cada valor de cada dimension monitoreada por separado -- eso es lo
que permite detectar dos incidentes simultaneos en segmentos distintos sin confundirlos con una
sola caida generica (master plan Sec 9.7).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from contracts.schemas import Anomaly, Severity, Transaction
from engine.detection.baseline import compute_baseline, dimension_key, group_by_segment

MIN_VOLUME = 20  # no alarmar sobre segmentos con muy pocos intentos
PERSISTENCE_REQUIRED = 2  # ventanas consecutivas sostenidas antes de confirmar
SEGMENT_DIMENSIONS = ["provider", "country", "payment_method", "issuing_bank", "merchant"]


def _severity_from_gap(observed: float, lower_bound: float) -> Severity:
    gap = lower_bound - observed  # cuanto por debajo del limite "normal" cayo
    if gap >= 0.30:
        return Severity.critical
    if gap >= 0.15:
        return Severity.high
    if gap >= 0.05:
        return Severity.medium
    return Severity.low


def _check_segment(
    dims: dict,
    history: list[Transaction],
    current_window: list[Transaction],
    window_start: datetime,
    window_end: datetime,
    persistence_state: dict[str, int],
) -> Anomaly | None:
    segment_current = [t for t in current_window if all(getattr(t, k, None) == v for k, v in dims.items())]
    if len(segment_current) < MIN_VOLUME:
        return None

    baseline = compute_baseline(history, dims, window_start, window_end)
    observed = sum(1 for t in segment_current if t.approved) / len(segment_current)

    key = dimension_key(dims)
    lower_bound = baseline.credible_interval[0]

    if observed >= lower_bound:
        persistence_state[key] = 0  # se recupero, resetea la racha
        return None

    persistence_state[key] = persistence_state.get(key, 0) + 1
    if persistence_state[key] < PERSISTENCE_REQUIRED:
        return None  # todavia no se sostuvo lo suficiente, podria ser ruido

    return Anomaly(
        anomaly_id=f"anom_{uuid.uuid4().hex[:8]}",
        detected_at=window_end,
        dimension_key=key,
        window_start=window_start,
        window_end=window_end,
        observed_approval_rate=round(observed, 4),
        expected_approval_rate=baseline.expected_approval_rate,
        persistence_windows=persistence_state[key],
        volume=len(segment_current),
        severity=_severity_from_gap(observed, lower_bound),
    )


def detect(
    history: list[Transaction],
    current_window: list[Transaction],
    window_start: datetime,
    window_end: datetime,
    persistence_state: dict[str, int] | None = None,
) -> list[Anomaly]:
    """
    Corre la deteccion a nivel global y por cada valor de cada dimension monitoreada.

    `persistence_state` se pasa entre llamadas sucesivas (una por ventana de tiempo) para
    contar cuantas ventanas seguidas un segmento viene mal -- inicializalo una vez afuera del
    loop de ventanas y reusalo en cada llamada.
    """
    if persistence_state is None:
        persistence_state = {}

    anomalies: list[Anomaly] = []

    global_anomaly = _check_segment({}, history, current_window, window_start, window_end, persistence_state)
    if global_anomaly:
        anomalies.append(global_anomaly)

    for dimension in SEGMENT_DIMENSIONS:
        for value in group_by_segment(current_window, dimension):
            anomaly = _check_segment(
                {dimension: value}, history, current_window, window_start, window_end, persistence_state,
            )
            if anomaly:
                anomalies.append(anomaly)

    return anomalies
