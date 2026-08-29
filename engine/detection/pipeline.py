"""Pipeline automatico: conecta DetectionEngine -> mix-shift -> generate_candidates.

Hasta ahora estas tres piezas se llamaban a mano, una por una, como en demo.py. Este modulo
las encadena solas por cada ventana que se cierra, para que Stream C (Valentin) consuma UNA
sola cosa por ventana en vez de orquestar el pipeline el mismo.

No toca contracts/schemas.py: WindowResult y AnomalyDiagnosis son estructuras INTERNAS de
Stream B, armadas enteramente con los tipos ya compartidos (Anomaly, IncidentCandidate,
Evidence). Si en algun momento Stream C necesita que esta forma de salida sea parte del
contrato oficial, eso se decide y se suma a schemas.py explicitamente, no al reves.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from contracts.schemas import Anomaly, Evidence, IncidentCandidate, Transaction
from engine.detection.aggregator import WindowBatch
from engine.detection.config import DetectionConfig
from engine.detection.engine import DetectionEngine
from engine.detection.mix_shift import decompose
from engine.rootcause.candidates import generate_candidates

# decompose() explica UNA dimension a la vez (Sec 9.3). Una anomalia de "global" o de 2+
# dimensiones combinadas no tiene una unica dimension que decomponer -- ahi se deja
# mix_shift_effect_pp/performance_effect_pp en None en vez de inventar a cual aplicarselo.
MIX_SHIFT_DIMENSIONS = {"provider", "country", "payment_method", "issuing_bank", "merchant"}


@dataclass(frozen=True)
class AnomalyDiagnosis:
    """Todo lo que Stream C necesita para UNA anomalia: la anomalia (ya con mix-shift
    incorporado si aplica), y SOLO los candidatos RCA que le pertenecen a ella (ver
    `_owns_candidate`) -- si hay 2+ incidentes en la misma ventana, cada uno recibe su
    propia lista, no la de toda la ventana. `evidence` trae unicamente la evidencia citada
    por esos candidatos ya filtrados (no toda la evidencia generada en la ventana)."""

    anomaly: Anomaly
    candidates: list[IncidentCandidate]
    evidence: list[Evidence]


@dataclass(frozen=True)
class WindowResult:
    """La salida de UNA ventana cerrada: cero o mas diagnosticos, uno por anomalia
    confirmada en esa ventana. Lista vacia = ventana sana, Stream C no tiene nada que hacer."""

    window_start: datetime
    window_end: datetime
    diagnoses: list[AnomalyDiagnosis]


def _dims_in_key(dimension_key: str) -> dict[str, str]:
    """'country=BR|provider=nova_pay' -> {'country': 'BR', 'provider': 'nova_pay'}.
    'global' -> {} (no tiene dimensiones propias)."""
    if dimension_key == "global":
        return {}
    return dict(part.split("=", 1) for part in dimension_key.split("|"))


def _with_mix_shift(
    anomaly: Anomaly, baseline: list[Transaction], current_window: list[Transaction],
) -> Anomaly:
    """Completa mix_shift_effect_pp/performance_effect_pp cuando la anomalia es de una sola
    dimension conocida. Devuelve una copia (Anomaly es inmutable) -- no muta el original."""
    dims = _dims_in_key(anomaly.dimension_key)
    if len(dims) != 1:
        return anomaly
    (dim_name,) = dims.keys()
    if dim_name not in MIX_SHIFT_DIMENSIONS:
        return anomaly
    mix_pp, performance_pp = decompose(baseline, current_window, dimension=dim_name)
    return anomaly.model_copy(update={
        "mix_shift_effect_pp": mix_pp,
        "performance_effect_pp": performance_pp,
    })


def _owns_candidate(candidate_dims: dict, anomaly_dims: dict) -> bool:
    """Filtro de "ownership" (pedido por Stream C, ver DECISIONS.md): un candidato le
    pertenece a esta anomalia si no CONTRADICE ninguna dimension que la anomalia ya fijo,
    Y comparte al menos una dimension con ella -- asi nunca se le atribuye a una anomalia
    el candidato mas fuerte de OTRO incidente concurrente en la misma ventana (que como
    minimo, difiere en el valor de alguna dimension compartida).

    'global' (anomaly_dims vacio) no tiene segmento propio -- acepta cualquier candidato,
    son todos posibles explicaciones validas del agregado.

    A proposito NO exige que el candidato cubra TODAS las dimensiones de la anomalia: una
    anomalia de 3 dimensiones (ej. provider+country+payment_method) igual puede quedarse
    sin ningun candidato si exigieramos cobertura total, porque generate_candidates() busca
    como maximo `config.rca_max_dimensions` (2 por defecto). Contraparte honesta: un
    candidato que no comparte NINGUNA dimension con la anomalia (ej. solo payment_method+
    issuing_bank contra una anomalia de provider+country) queda afuera aunque en los datos
    reales resulte ser el mismo incidente -- se prefiere sub-cubrir a sobre-atribuir.
    """
    if not anomaly_dims:
        return True
    shared_keys = anomaly_dims.keys() & candidate_dims.keys()
    if not shared_keys:
        return False
    return all(candidate_dims[k] == anomaly_dims[k] for k in shared_keys)


class DetectionPipeline:
    """Envuelve DetectionEngine: por cada ventana cerrada, ademas de detectar corre
    mix-shift y RCA solos, y devuelve todo junto en un WindowResult.

    Uso:
        pipeline = DetectionPipeline(history)
        for txn in stream_ordenado:
            for result in pipeline.ingest(txn):
                consumir(result)          # un WindowResult por cada ventana que se cerro
        ultimo = pipeline.flush()         # no olvidarse al terminar el stream / replay

    El baseline (`history`) se mantiene ESTABLE durante toda la corrida a proposito, igual
    que en DetectionEngine -- asi un incidente sostenido no contamina su propia referencia
    ventana a ventana (ver comentario en engine.py). No se re-explica aca esa decision, solo
    se respeta.
    """

    def __init__(
        self, history: list[Transaction] | None = None, config: DetectionConfig | None = None,
    ) -> None:
        self.config = config or DetectionConfig()
        self.history: list[Transaction] = list(history or [])
        self._engine = DetectionEngine(self.history, self.config)

    def ingest(self, transaction: Transaction) -> list[WindowResult]:
        results: list[WindowResult] = []
        for batch in self._engine.aggregator.ingest(transaction):
            results.append(self._diagnose(batch))
        return results

    def flush(self) -> WindowResult | None:
        batch = self._engine.aggregator.flush()
        return self._diagnose(batch) if batch is not None else None

    def _diagnose(self, batch: WindowBatch) -> WindowResult:
        anomalies = self._engine.process_batch(batch)
        current_window = list(batch.transactions)
        window_minutes = (batch.window_end - batch.window_start).total_seconds() / 60.0

        diagnoses: list[AnomalyDiagnosis] = []
        for anomaly in anomalies:
            enriched = _with_mix_shift(anomaly, self.history, current_window)
            all_candidates, all_evidence = generate_candidates(
                anomaly_id=enriched.anomaly_id,
                history=self.history,
                current_window=current_window,
                anomaly_window_minutes=window_minutes,
                config=self.config,
            )

            # ownership: si hay 2+ incidentes en esta ventana, generate_candidates() busca
            # en TODA la ventana y devuelve los mismos candidatos para cualquier anomalia
            # que lo pida -- aca se recorta a los que realmente le pertenecen a ESTA
            # anomalia (ver _owns_candidate), para que Stream C nunca reciba el candidato
            # mas fuerte de un incidente concurrente distinto.
            anomaly_dims = _dims_in_key(enriched.dimension_key)
            own_candidates = [c for c in all_candidates if _owns_candidate(
                c.dimensions.model_dump(exclude_none=True), anomaly_dims,
            )]
            own_evidence_ids = {eid for c in own_candidates for eid in c.evidence_ids}
            own_evidence = [e for e in all_evidence if e.evidence_id in own_evidence_ids]

            diagnoses.append(AnomalyDiagnosis(anomaly=enriched, candidates=own_candidates, evidence=own_evidence))

        return WindowResult(
            window_start=batch.window_start, window_end=batch.window_end, diagnoses=diagnoses,
        )
