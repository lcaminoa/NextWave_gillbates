"""Descomposicion de cambio de mezcla de trafico (master plan Sec 9.3). SHOULD, no MUST, pero
barato de tener: separa cuanto de una caida agregada es cambio de composicion del trafico
(paradoja de Simpson) vs. degradacion real dentro de los segmentos.
"""
from __future__ import annotations

from collections import defaultdict

from contracts.schemas import Transaction


def _segment_stats(transactions: list[Transaction], dimension: str) -> dict[str, tuple[float, float]]:
    """Para cada valor de la dimension: (peso = fraccion del trafico, tasa de aprobacion)."""
    counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # [aprobados, total]
    for t in transactions:
        value = getattr(t, dimension, None)
        if value is None:
            continue
        counts[value][1] += 1
        if t.approved:
            counts[value][0] += 1

    total = sum(c[1] for c in counts.values()) or 1
    return {value: (c[1] / total, (c[0] / c[1]) if c[1] else 0.0) for value, c in counts.items()}


def decompose(
    baseline_transactions: list[Transaction], current_transactions: list[Transaction],
    dimension: str = "country",
) -> tuple[float, float]:
    """Devuelve (mix_shift_effect_pp, performance_effect_pp), en puntos porcentuales, que suman
    aproximadamente el cambio observado en la tasa agregada.

    mix_shift_effect_pp explica cuanto de la caida es que cambio la PROPORCION de trafico hacia
    segmentos que ya de por si convierten distinto -- no que algo se haya roto.
    performance_effect_pp es la degradacion real dentro de los segmentos, a composicion de
    trafico constante -- esto es lo que de verdad importa investigar.
    """
    baseline_stats = _segment_stats(baseline_transactions, dimension)
    current_stats = _segment_stats(current_transactions, dimension)

    segments = set(baseline_stats) | set(current_stats)
    mix_effect = 0.0
    performance_effect = 0.0

    for segment in segments:
        base_weight, base_rate = baseline_stats.get(segment, (0.0, 0.0))
        cur_weight, cur_rate = current_stats.get(segment, (0.0, base_rate))
        mix_effect += (cur_weight - base_weight) * base_rate
        performance_effect += cur_weight * (cur_rate - base_rate)

    return round(mix_effect * 100, 2), round(performance_effect * 100, 2)
