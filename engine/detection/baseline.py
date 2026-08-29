"""Baseline estadistico Beta-Binomial (DECISIONS.md D001; master plan Sec 9.1).

La aprobacion es una proporcion (aprobados/intentados), no un valor puntual. El baseline es una
distribucion Beta actualizada con los datos historicos del segmento, no un promedio simple.
Segmentos con poco volumen quedan con intervalos de credibilidad mas anchos en vez de una falsa
certeza; segmentos con mucho volumen quedan con intervalos angostos.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from scipy import stats

from contracts.schemas import BaselinePoint, Transaction

# Prior debil (Beta(2,2)): no asumimos nada fuerte de entrada, los datos dominan apenas hay
# unas pocas decenas de transacciones.
PRIOR_ALPHA = 2.0
PRIOR_BETA = 2.0
CREDIBLE_INTERVAL = (0.05, 0.95)  # percentiles de la posterior (90% de confianza)


def dimension_key(dims: dict) -> str:
    """Clave canonica de un segmento, ej. 'country=BR|provider=nova_pay'. Ordena las claves
    para que el mismo segmento siempre produzca el mismo string sin importar el orden del dict.
    """
    if not dims:
        return "global"
    return "|".join(f"{k}={v}" for k, v in sorted(dims.items()) if v is not None)


def _matches(txn: Transaction, dims: dict) -> bool:
    """True si la transaccion pertenece al segmento `dims`."""
    return all(getattr(txn, k, None) == v for k, v in dims.items())


def compute_baseline(
    history: list[Transaction], dims: dict, window_start: datetime, window_end: datetime,
) -> BaselinePoint:
    """Calcula el baseline (tasa de aprobacion normal + intervalo de confianza) para un segmento
    a partir de transacciones historicas.

    `history` deberia ser anterior al periodo evaluado (para no medir la anomalia contra si
    misma). Mejora simple pendiente: filtrar `history` por el mismo bucket de hora del dia /
    dia de la semana antes de pasarla -- se deja a criterio de quien llama.
    """
    segment_txns = [t for t in history if _matches(t, dims)]
    approved = sum(1 for t in segment_txns if t.approved)
    total = len(segment_txns)

    # actualizacion Beta-Binomial: sumar aprobados/rechazados directo al prior
    alpha_post = PRIOR_ALPHA + approved
    beta_post = PRIOR_BETA + (total - approved)

    expected_rate = alpha_post / (alpha_post + beta_post)
    lower = stats.beta.ppf(CREDIBLE_INTERVAL[0], alpha_post, beta_post)
    upper = stats.beta.ppf(CREDIBLE_INTERVAL[1], alpha_post, beta_post)

    return BaselinePoint(
        dimension_key=dimension_key(dims),
        window_start=window_start,
        window_end=window_end,
        expected_approval_rate=round(float(expected_rate), 4),
        credible_interval=(round(float(lower), 4), round(float(upper), 4)),
        volume=total,
    )


def group_by_segment(transactions: list[Transaction], dimension: str) -> dict[str, list[Transaction]]:
    """Agrupa transacciones por el valor de UNA dimension (ej. 'provider' -> {"nova_pay": [...],
    "stripe": [...]}) -- base para barrer segmentos en deteccion y RCA.
    """
    groups: dict[str, list[Transaction]] = defaultdict(list)
    for t in transactions:
        value = getattr(t, dimension, None)
        if value is not None:
            groups[value].append(t)
    return groups
