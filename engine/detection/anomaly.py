"""Deteccion secuencial de anomalias sobre el baseline (DECISIONS.md D001; master plan Sec 9.2).

Compara la aprobacion observada en una ventana reciente contra el baseline esperado del mismo
segmento, y solo levanta una Anomaly si la caida es real y se sostiene varias ventanas seguidas
-- no un pago rechazado suelto ni ruido de bajo volumen.

Revisa el agregado global Y cada valor de cada dimension monitoreada por separado -- eso es lo
que permite detectar dos incidentes simultaneos en segmentos distintos sin confundirlos con una
sola caida generica (master plan Sec 9.7).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from contracts.schemas import Anomaly, Severity, Transaction
from engine.detection.baseline import compute_baseline, dimension_key
from engine.detection.config import DetectionConfig

SEGMENT_DIMENSIONS = ["provider", "country", "payment_method", "issuing_bank", "merchant"]
SEGMENT_DIMENSION_SETS = [
    (),
    *((dimension,) for dimension in SEGMENT_DIMENSIONS),
    ("provider", "country", "payment_method"),
]


@dataclass
class DetectionState:
    """Estado que se conserva entre ventanas cerradas del mismo stream."""

    persistence: dict[str, int] = field(default_factory=dict)
    ewma: dict[str, float] = field(default_factory=dict)


def _severity_from_gap(observed: float, lower_bound: float) -> Severity:
    """Que tan grave es la caida, segun cuanto por debajo del piso "normal" quedo lo observado."""
    gap = lower_bound - observed
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
    state: DetectionState,
    config: DetectionConfig,
) -> Anomaly | None:
    """Chequea UN segmento (o el agregado global si `dims` es {}). Devuelve una Anomaly si esta
    mal, tiene volumen suficiente y ya se sostuvo el numero configurado de ventanas."""
    segment_current = [t for t in current_window if all(getattr(t, k, None) == v for k, v in dims.items())]
    if len(segment_current) < config.min_volume:
        return None

    baseline = compute_baseline(history, dims, window_start, window_end, config)
    observed = sum(1 for t in segment_current if t.approved) / len(segment_current)

    key = dimension_key(dims)
    lower_bound = baseline.credible_interval[0]
    residual = observed - baseline.expected_approval_rate
    previous_ewma = state.ewma.get(key, 0.0)
    ewma = config.ewma_lambda * residual + (1 - config.ewma_lambda) * previous_ewma
    state.ewma[key] = ewma

    if observed >= lower_bound or ewma >= config.ewma_threshold:
        state.persistence[key] = 0  # se recupero, resetea la racha
        return None

    state.persistence[key] = state.persistence.get(key, 0) + 1
    if state.persistence[key] < config.persistence_windows:
        return None  # todavia no se sostuvo lo suficiente, podria ser ruido

    return Anomaly(
        anomaly_id=f"anom_{uuid.uuid4().hex[:8]}",
        detected_at=window_end,
        dimension_key=key,
        window_start=window_start,
        window_end=window_end,
        observed_approval_rate=round(observed, 4),
        expected_approval_rate=baseline.expected_approval_rate,
        persistence_windows=state.persistence[key],
        volume=len(segment_current),
        severity=_severity_from_gap(observed, lower_bound),
    )


def detect(
    history: list[Transaction],
    current_window: list[Transaction],
    window_start: datetime,
    window_end: datetime,
    state: DetectionState | None = None,
    config: DetectionConfig | None = None,
) -> list[Anomaly]:
    """Corre la deteccion a nivel global y por cada valor de cada dimension monitoreada.

    `state` se pasa entre llamadas sucesivas para conservar EWMA y persistencia.
    """
    state = state or DetectionState()
    config = config or DetectionConfig()

    anomalies: list[Anomaly] = []

    for dimension_names in SEGMENT_DIMENSION_SETS:
        if not dimension_names:
            dimension_values = [()]
        else:
            dimension_values = {
                tuple(getattr(transaction, name) for name in dimension_names)
                for transaction in current_window
            }

        for values in dimension_values:
            dims = dict(zip(dimension_names, values))
            anomaly = _check_segment(
                dims, history, current_window, window_start, window_end, state, config,
            )
            if anomaly:
                anomalies.append(anomaly)

    return anomalies
