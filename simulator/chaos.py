"""Estado en memoria para incidentes inyectados por la consola de caos."""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta

from contracts.schemas import ChaosMode, ChaosSpec, Dimensions
from simulator.catalog import (
    COUNTRIES,
    ISSUING_BANKS_BY_COUNTRY,
    MERCHANTS,
    PAYMENT_METHODS_BY_COUNTRY,
    PROVIDERS,
)


class ChaosInjector:
    """Administra los ChaosSpec activos sin conocer HTTP ni el motor de detección.

    Conserva las dimensiones de un ``random_unknown`` internamente. Quien expone el
    API debe usar :meth:`public_spec`, que las omite hasta que se llame a
    :meth:`reveal`.
    """

    def __init__(self, rng: random.Random | None = None) -> None:
        self._rng = rng or random.Random()
        self._specs: dict[str, ChaosSpec] = {}
        self._last_chaos_id: str | None = None

    def inject(self, spec: ChaosSpec) -> ChaosSpec:
        """Registra un incidente manual o desconocido y devuelve el spec interno."""
        self._validate(spec)
        self._specs[spec.chaos_id] = spec
        self._last_chaos_id = spec.chaos_id
        return spec

    def inject_manual(
        self,
        dimensions: Dimensions,
        severity_pp: float,
        started_at: datetime,
        duration_minutes: int | None = None,
    ) -> ChaosSpec:
        return self.inject(
            ChaosSpec(
                chaos_id=self._new_id(),
                mode=ChaosMode.manual,
                dimensions=dimensions,
                severity_pp=severity_pp,
                started_at=started_at,
                duration_minutes=duration_minutes,
                revealed=True,
            )
        )

    def inject_random(
        self,
        severity_pp: float,
        started_at: datetime,
        duration_minutes: int | None = None,
    ) -> ChaosSpec:
        """Crea un incidente válido, pero marcado como oculto hasta ``reveal``."""
        country = self._rng.choice(COUNTRIES)
        provider = self._rng.choice(PROVIDERS)
        payment_method = self._rng.choice(PAYMENT_METHODS_BY_COUNTRY[country])
        issuing_bank = self._rng.choice(ISSUING_BANKS_BY_COUNTRY[country])
        # No elegimos las cinco dimensiones juntas: a 1.200 tx/min ese segmento
        # tendría volumen insuficiente para que el detector pueda evaluarlo. Cada
        # opción conserva suficiente tráfico y cubre causas de proveedor, método,
        # emisor o comercio.
        dimensions = self._rng.choice(
            [
                Dimensions(provider=provider, country=country),
                Dimensions(provider=provider, country=country, payment_method=payment_method),
                Dimensions(provider=provider),
                Dimensions(issuing_bank=issuing_bank),
                Dimensions(merchant=self._rng.choice(MERCHANTS)),
            ]
        )
        return self.inject(
            ChaosSpec(
                chaos_id=self._new_id(),
                mode=ChaosMode.random_unknown,
                dimensions=dimensions,
                severity_pp=severity_pp,
                started_at=started_at,
                duration_minutes=duration_minutes,
                revealed=False,
            )
        )

    def active_at(self, timestamp: datetime) -> list[ChaosSpec]:
        """Devuelve todos los incidentes activos en ese instante.

        La lista permite probar dos incidentes independientes en paralelo. Si dos
        atacan exactamente una misma transacción, sus caídas se acumulan y el stream
        limita la tasa resultante a un mínimo seguro.
        """
        return [spec for spec in self._specs.values() if _is_active(spec, timestamp)]

    def reveal(self, chaos_id: str | None = None) -> ChaosSpec | None:
        """Revela y devuelve el último incidente (o uno indicado) para el jurado."""
        target_id = chaos_id or self._last_chaos_id
        if target_id is None or target_id not in self._specs:
            return None
        spec = self._specs[target_id]
        revealed = spec.model_copy(update={"revealed": True})
        self._specs[target_id] = revealed
        return revealed

    def public_spec(self, chaos_id: str | None = None) -> ChaosSpec | None:
        """Vista segura para API/UI: no filtra las dimensiones aún ocultas."""
        target_id = chaos_id or self._last_chaos_id
        if target_id is None:
            return None
        spec = self._specs.get(target_id)
        if spec is None:
            return None
        if spec.mode is ChaosMode.random_unknown and not spec.revealed:
            return spec.model_copy(update={"dimensions": None})
        return spec

    @staticmethod
    def _validate(spec: ChaosSpec) -> None:
        if not spec.dimensions or not spec.dimensions.model_dump(exclude_none=True):
            raise ValueError("ChaosSpec requiere al menos una dimensión afectada")
        if not 0 < abs(spec.severity_pp) <= 95:
            raise ValueError("severity_pp debe estar entre 1 y 95 puntos porcentuales")
        if spec.duration_minutes is not None and spec.duration_minutes <= 0:
            raise ValueError("duration_minutes debe ser mayor que cero")

    @staticmethod
    def _new_id() -> str:
        return f"chaos_{uuid.uuid4().hex[:10]}"


def _is_active(spec: ChaosSpec, timestamp: datetime) -> bool:
    if timestamp < spec.started_at:
        return False
    if spec.duration_minutes is None:
        return True
    return timestamp < spec.started_at + timedelta(minutes=spec.duration_minutes)
