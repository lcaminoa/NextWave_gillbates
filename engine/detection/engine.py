"""Fachada stateful que conecta stream, agregacion y deteccion estadistica."""
from __future__ import annotations

from contracts.schemas import Anomaly, Transaction
from engine.detection.aggregator import WindowAggregator, WindowBatch
from engine.detection.anomaly import DetectionState, detect
from engine.detection.config import DetectionConfig


class DetectionEngine:
    """Consume transacciones ordenadas y devuelve anomalías al cerrar cada ventana."""

    def __init__(
        self,
        history: list[Transaction] | None = None,
        config: DetectionConfig | None = None,
    ) -> None:
        self.config = config or DetectionConfig()
        # El baseline se inicializa con historia previa y se mantiene estable durante
        # una corrida. Asi una caida sostenida no contamina inmediatamente su propia
        # referencia; la adaptacion segura del baseline se incorpora despues con una
        # politica explicita de ventanas saludables.
        self.history = list(history or [])
        self.aggregator = WindowAggregator(self.config)
        self.state = DetectionState()

    def ingest(self, transaction: Transaction) -> list[Anomaly]:
        """Procesa una transacción y detecta al cerrar una ventana anterior."""
        anomalies: list[Anomaly] = []
        for batch in self.aggregator.ingest(transaction):
            anomalies.extend(self.process_batch(batch))
        return anomalies

    def flush(self) -> list[Anomaly]:
        """Procesa la última ventana abierta al finalizar el stream o un replay."""
        batch = self.aggregator.flush()
        return self.process_batch(batch) if batch else []

    def process_batch(self, batch: WindowBatch) -> list[Anomaly]:
        """Evalúa una ventana contra la historia previa de baseline."""
        return detect(
            history=self.history,
            current_window=list(batch.transactions),
            window_start=batch.window_start,
            window_end=batch.window_end,
            state=self.state,
            config=self.config,
        )
