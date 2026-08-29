"""Generador reproducible de transacciones del Stream A."""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta
from typing import Iterator

from contracts.schemas import ChaosSpec, Transaction
from simulator.catalog import (
    BASE_APPROVAL_RATE,
    COUNTRIES,
    DECLINE_CODES,
    ISSUING_BANKS_BY_COUNTRY,
    MERCHANTS,
    PAYMENT_METHODS_BY_COUNTRY,
    PROVIDERS,
    RAW_CODE_BY_DECLINE,
)
from simulator.chaos import ChaosInjector


class PaymentSimulator:
    """Produce ``Transaction`` sintéticas y aplica todos los chaos activos.

    No abre sockets, no administra HTTP y no invoca el detector. La API puede consumir
    ``stream`` para publicar eventos en vivo o ``generate`` para pruebas rápidas.
    """

    def __init__(self, seed: int | None = None) -> None:
        self._rng = random.Random(seed)
        self.chaos = ChaosInjector(self._rng)

    def inject(self, spec: ChaosSpec) -> ChaosSpec:
        return self.chaos.inject(spec)

    def next_transaction(self, timestamp: datetime) -> Transaction:
        merchant = self._rng.choice(MERCHANTS)
        provider = self._rng.choice(PROVIDERS)
        country = self._rng.choice(COUNTRIES)
        payment_method = self._rng.choice(PAYMENT_METHODS_BY_COUNTRY[country])
        issuing_bank = self._rng.choice(ISSUING_BANKS_BY_COUNTRY[country])
        dimensions = {
            "merchant": merchant,
            "provider": provider,
            "country": country,
            "payment_method": payment_method,
            "issuing_bank": issuing_bank,
        }

        approval_rate = BASE_APPROVAL_RATE[payment_method] * _hour_factor(timestamp)
        approval_rate += self._rng.uniform(-0.02, 0.02)
        matching_chaos = [
            spec
            for spec in self.chaos.active_at(timestamp)
            if _matches(dimensions, spec)
        ]
        approval_rate -= sum(abs(spec.severity_pp) for spec in matching_chaos) / 100
        approval_rate = max(0.01, min(0.995, approval_rate))

        approved = self._rng.random() < approval_rate
        decline_code = raw_code = raw_message = None
        if not approved:
            decline_code = _decline_code_for(matching_chaos, self._rng)
            raw_code = RAW_CODE_BY_DECLINE[decline_code]
            raw_message = decline_code.replace("_", " ").upper()

        return Transaction(
            transaction_id=f"txn_{uuid.uuid4().hex[:12]}",
            timestamp=timestamp,
            merchant=merchant,
            provider=provider,
            payment_method=payment_method,
            country=country,
            issuing_bank=issuing_bank,
            approved=approved,
            amount=round(self._rng.uniform(15, 400), 2),
            currency="USD",
            raw_provider_code=raw_code,
            raw_provider_message=raw_message,
            canonical_decline_code=decline_code,
            latency_ms=self._rng.randint(120, 900),
        )

    def generate(
        self,
        start: datetime,
        count: int,
        interval_seconds: float = 1.0,
    ) -> list[Transaction]:
        if count < 0:
            raise ValueError("count no puede ser negativo")
        if interval_seconds <= 0:
            raise ValueError("interval_seconds debe ser mayor que cero")
        return list(self.stream(start, count, interval_seconds))

    def stream(
        self,
        start: datetime,
        count: int | None = None,
        interval_seconds: float = 1.0,
    ) -> Iterator[Transaction]:
        """Itera transacciones consecutivas; ``count=None`` es un stream infinito."""
        if count is not None and count < 0:
            raise ValueError("count no puede ser negativo")
        if interval_seconds <= 0:
            raise ValueError("interval_seconds debe ser mayor que cero")

        timestamp = start
        emitted = 0
        while count is None or emitted < count:
            yield self.next_transaction(timestamp)
            timestamp += timedelta(seconds=interval_seconds)
            emitted += 1


def _hour_factor(timestamp: datetime) -> float:
    weekday_factor = 0.98 if timestamp.weekday() >= 5 else 1.0
    night_factor = 0.97 if timestamp.hour < 6 else 1.0
    return weekday_factor * night_factor


def _matches(transaction_dimensions: dict[str, str], spec: ChaosSpec) -> bool:
    if not spec.dimensions:
        return False
    affected = spec.dimensions.model_dump(exclude_none=True)
    return bool(affected) and all(transaction_dimensions.get(key) == value for key, value in affected.items())


def _decline_code_for(specs: list[ChaosSpec], rng: random.Random) -> str:
    if not specs:
        return rng.choice(DECLINE_CODES)
    dimensions = specs[0].dimensions
    if dimensions and dimensions.issuing_bank:
        return "issuer_unavailable"
    if dimensions and dimensions.provider:
        return "provider_timeout"
    return "do_not_honor"
