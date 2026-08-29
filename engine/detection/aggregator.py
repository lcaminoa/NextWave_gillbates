"""Agregacion de transacciones en ventanas fijas para Stream B.

Este modulo no modifica los detectores existentes. Convierte el stream de
``Transaction`` en ventanas cerradas con estadisticas globales y por segmentos;
la integracion posterior conectara esos ``WindowBatch`` al baseline y detector.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable

from contracts.schemas import Transaction
from engine.detection.config import DetectionConfig


# Segmentos que el detector evaluara antes de derivar a RCA. El RCA conserva las
# transacciones originales y puede explorar combinaciones adicionales.
DEFAULT_DIMENSION_SETS: tuple[tuple[str, ...], ...] = (
    (),
    ("provider",),
    ("country",),
    ("payment_method",),
    ("issuing_bank",),
    ("merchant",),
    ("provider", "country", "payment_method"),
)


@dataclass(frozen=True)
class WindowStats:
    """Metricas de aprobacion de un segmento durante una ventana cerrada."""

    window_start: datetime
    window_end: datetime
    dimensions: dict[str, str]
    attempts: int
    approvals: int

    @property
    def observed_approval_rate(self) -> float:
        return self.approvals / self.attempts if self.attempts else 0.0


@dataclass(frozen=True)
class WindowBatch:
    """Una ventana cerrada, sus eventos originales y estadisticas agregadas."""

    window_start: datetime
    window_end: datetime
    transactions: tuple[Transaction, ...]
    stats: tuple[WindowStats, ...]


class WindowAggregator:
    """Agrupa un stream ordenado de transacciones en ventanas de longitud fija.

    La primera transaccion abre una ventana. Al llegar una transaccion perteneciente
    a una ventana posterior, la actual se cierra y se devuelve como ``WindowBatch``.
    Los eventos tardios se rechazan deliberadamente: el consumidor del stream debe
    aplicar una politica de watermark antes de invocar este MVP.
    """

    def __init__(
        self,
        config: DetectionConfig | None = None,
        dimension_sets: Iterable[tuple[str, ...]] = DEFAULT_DIMENSION_SETS,
    ) -> None:
        self.config = config or DetectionConfig()
        self.dimension_sets = tuple(dimension_sets)
        self._current_window_start: datetime | None = None
        self._transactions: list[Transaction] = []

    def ingest(self, transaction: Transaction) -> list[WindowBatch]:
        """Incorpora una transaccion y devuelve las ventanas que acaba de cerrar."""
        transaction_window_start = self._floor_to_window(transaction.timestamp)

        if self._current_window_start is None:
            self._current_window_start = transaction_window_start

        if transaction_window_start < self._current_window_start:
            raise ValueError(
                "Transaccion fuera de orden: aplicar watermark antes de WindowAggregator"
            )

        closed: list[WindowBatch] = []
        if transaction_window_start > self._current_window_start:
            closed.append(self._close_current_window())
            self._current_window_start = transaction_window_start

        self._transactions.append(transaction)
        return closed

    def flush(self) -> WindowBatch | None:
        """Cierra la ventana abierta; util para shutdown, tests o fin de un replay."""
        if self._current_window_start is None:
            return None
        return self._close_current_window()

    def _floor_to_window(self, timestamp: datetime) -> datetime:
        day_start = timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
        elapsed_seconds = int((timestamp - day_start).total_seconds())
        offset_seconds = elapsed_seconds - (elapsed_seconds % self.config.window_seconds)
        return day_start + timedelta(seconds=offset_seconds)

    def _close_current_window(self) -> WindowBatch:
        if self._current_window_start is None:
            raise RuntimeError("No existe una ventana abierta para cerrar")

        window_start = self._current_window_start
        window_end = window_start + timedelta(seconds=self.config.window_seconds)
        transactions = tuple(self._transactions)
        stats = self._build_stats(transactions, window_start, window_end)

        self._transactions = []
        self._current_window_start = None
        return WindowBatch(
            window_start=window_start,
            window_end=window_end,
            transactions=transactions,
            stats=stats,
        )

    def _build_stats(
        self,
        transactions: tuple[Transaction, ...],
        window_start: datetime,
        window_end: datetime,
    ) -> tuple[WindowStats, ...]:
        counters: dict[tuple[tuple[str, str], ...], list[int]] = defaultdict(lambda: [0, 0])

        for transaction in transactions:
            for dimension_names in self.dimension_sets:
                dimensions = tuple(
                    (name, str(getattr(transaction, name))) for name in dimension_names
                )
                counter = counters[dimensions]
                counter[0] += 1
                counter[1] += int(transaction.approved)

        return tuple(
            WindowStats(
                window_start=window_start,
                window_end=window_end,
                dimensions=dict(dimensions),
                attempts=attempts,
                approvals=approvals,
            )
            for dimensions, (attempts, approvals) in sorted(counters.items())
        )
