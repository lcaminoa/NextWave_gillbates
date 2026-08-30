"""Configuracion central del motor de deteccion.

Por ahora este modulo no se importa desde los detectores existentes: mantiene los
valores actuales sin tocar los archivos que otro integrante esta editando. Cuando
se integre, cada modulo recibira una ``DetectionConfig`` en vez de usar constantes
hardcodeadas.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DetectionConfig:
    """Parametros ajustables para deteccion, baseline y RCA de Stream B."""

    # Ventanas y elegibilidad estadistica.
    window_seconds: int = 60
    min_volume: int = 20
    persistence_windows: int = 3

    # Baseline Beta-Binomial.
    credible_interval: float = 0.95
    prior_alpha: float = 2.0
    prior_beta: float = 2.0

    # Deteccion secuencial sobre el residuo observado - esperado.
    ewma_lambda: float = 0.3
    ewma_threshold: float = -0.05

    # Gate de cambio de mezcla. Ambos valores estan en puntos porcentuales positivos:
    # una caida se puede reclasificar como composicion solo si el efecto de mezcla es
    # material y no hay degradacion interna mayor a esta tolerancia.
    mix_shift_min_effect_pp: float = 1.0
    mix_shift_max_performance_degradation_pp: float = 1.0

    # Root-cause analysis.
    rca_min_segment_volume: int = 5
    rca_max_dimensions: int = 2
    revenue_normalizer_usd_per_hour: float = 5_000.0

    def __post_init__(self) -> None:
        if self.window_seconds <= 0:
            raise ValueError("window_seconds debe ser mayor a cero")
        if self.min_volume <= 0:
            raise ValueError("min_volume debe ser mayor a cero")
        if self.persistence_windows <= 0:
            raise ValueError("persistence_windows debe ser mayor a cero")
        if not 0 < self.credible_interval < 1:
            raise ValueError("credible_interval debe estar entre 0 y 1")
        if self.prior_alpha <= 0 or self.prior_beta <= 0:
            raise ValueError("prior_alpha y prior_beta deben ser mayores a cero")
        if not 0 < self.ewma_lambda <= 1:
            raise ValueError("ewma_lambda debe estar entre 0 y 1")
        if self.ewma_threshold >= 0:
            raise ValueError("ewma_threshold debe ser negativo para detectar caidas")
        if self.mix_shift_min_effect_pp <= 0:
            raise ValueError("mix_shift_min_effect_pp debe ser mayor a cero")
        if self.mix_shift_max_performance_degradation_pp <= 0:
            raise ValueError(
                "mix_shift_max_performance_degradation_pp debe ser mayor a cero"
            )
        if self.rca_min_segment_volume <= 0:
            raise ValueError("rca_min_segment_volume debe ser mayor a cero")
        if self.rca_max_dimensions <= 0:
            raise ValueError("rca_max_dimensions debe ser mayor a cero")
        if self.revenue_normalizer_usd_per_hour <= 0:
            raise ValueError("revenue_normalizer_usd_per_hour debe ser mayor a cero")
