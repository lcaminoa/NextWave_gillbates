"""Motor de diagnostico / RCA (master plan Sec 9.4-9.6, 9.8).

Dada una Anomaly, busca la combinacion de dimensiones que mejor explica la caida, generando
IncidentCandidate(s) rankeados por rca_score, con Evidence citable. No calcula nada que el
motor determinista no pueda respaldar -- el investigador de OpenAI (Stream C) solo elige entre
lo que esto ya calculo y cita evidence_ids, nunca inventa un numero (master plan Sec 9.8, 10).

Simplificacion a proposito: decline_code no entra en la busqueda combinatoria como dimension
(no tiene "tasa de rechazo propia" -- por definicion todas esas transacciones ya estan
rechazadas). Se usa como atributo de salida (`dominant_decline_code`), no como eje de busqueda.
"""
from __future__ import annotations

import itertools
import uuid

from contracts.schemas import Evidence, IncidentCandidate, Transaction
from engine.detection.baseline import compute_baseline, dimension_key

SEGMENT_DIMENSIONS = ["provider", "country", "payment_method", "issuing_bank", "merchant"]
MIN_SEGMENT_VOLUME = 5  # piso minimo, solo para evitar 1-2 transacciones sueltas
AVG_ORDER_VALUE_FALLBACK = 80.0
REVENUE_NORMALIZER_USD_PER_HOUR = 5000.0  # a partir de aca el peso de negocio ya satura en 1.0


def _decline_rate(transactions: list[Transaction]) -> float:
    """Fraccion de transacciones rechazadas (0 si la lista esta vacia)."""
    if not transactions:
        return 0.0
    return sum(1 for t in transactions if not t.approved) / len(transactions)


def _dominant_decline_code(transactions: list[Transaction]) -> str | None:
    """El canonical_decline_code que mas se repite entre las rechazadas."""
    codes = [t.canonical_decline_code for t in transactions if not t.approved and t.canonical_decline_code]
    if not codes:
        return None
    return max(set(codes), key=codes.count)


def _matches(txn: Transaction, dims: dict) -> bool:
    return all(getattr(txn, k, None) == v for k, v in dims.items())


def _estimate_revenue_loss_per_hour(
    segment_txns: list[Transaction], baseline_rate: float, window_minutes: float,
) -> float:
    """Plata perdida por hora si este segmento sigue asi: cuantas aprobaciones "de mas" hubiera
    habido con la tasa normal, multiplicado por el monto promedio de las que si se aprobaron."""
    if not segment_txns:
        return 0.0
    attempts = len(segment_txns)
    actual_approvals = sum(1 for t in segment_txns if t.approved)
    expected_approvals = attempts * baseline_rate
    lost_approvals = max(0.0, expected_approvals - actual_approvals)

    amounts = [t.amount for t in segment_txns if t.approved] or [AVG_ORDER_VALUE_FALLBACK]
    avg_order_value = sum(amounts) / len(amounts)

    loss_in_window = lost_approvals * avg_order_value
    hours = max(window_minutes / 60.0, 1 / 60.0)  # evita dividir por (casi) cero en ventanas cortas
    return round(loss_in_window / hours, 2)


def _rca_score(confidence: float, coverage: float, revenue_loss_usd_per_hour: float, n_dims: int) -> float:
    """confianza x cobertura x impacto_de_negocio x especificidad (master plan Sec 9.4).

    A diferencia de un intento anterior, esto es puramente multiplicativo -- ningun factor
    puede llevar el score a un valor negativo/cero por si solo, y `specificity` PREMIA una
    combinacion de mas dimensiones cuando sigue siendo significativa (Sec 9.5: la interseccion
    de dos dimensiones es evidencia mas fuerte que cualquiera de los agregados por separado),
    en vez de penalizarla como una "complejidad" a evitar.
    """
    revenue_weight = min(1.0, revenue_loss_usd_per_hour / REVENUE_NORMALIZER_USD_PER_HOUR)
    specificity = 1.0 + 0.15 * (n_dims - 1)
    return round(confidence * coverage * revenue_weight * specificity, 4)


def _counterfactual_checks(all_current: list[Transaction], dims: dict) -> list[tuple[str, str]]:
    """Genera un control por cada dimension del candidato (funciona para 1 O MAS dimensiones):
    para cada dimension, mantiene FIJAS las demas dimensiones del candidato y compara contra
    otro valor de esa dimension puntual -- evidencia de que el problema es esa interaccion
    especifica, no algo generico de una sola dimension (master plan Sec 9.5).

    Ej. para {provider: nova_pay, country: BR} genera hasta 2 controles: uno fijando country=BR
    y variando provider (prueba que no es "Brasil en general"), y otro fijando provider=nova_pay
    y variando country (prueba que no es "nova_pay en todos lados").

    Devuelve lista de (dimension, texto en lenguaje humano) -- puede venir vacia si no hay
    volumen suficiente para armar el control.
    """
    checks: list[tuple[str, str]] = []
    for dim_name, dim_value in dims.items():
        fixed = {k: v for k, v in dims.items() if k != dim_name}  # el resto del candidato, sin tocar
        pool = [t for t in all_current if _matches(t, fixed)]
        other_values = {getattr(t, dim_name) for t in pool if getattr(t, dim_name, None) != dim_value}
        if not other_values:
            continue
        control_value = sorted(other_values)[0]
        control_txns = [t for t in pool if getattr(t, dim_name, None) == control_value]
        if len(control_txns) < MIN_SEGMENT_VOLUME:
            continue
        control_rate = 1 - _decline_rate(control_txns)
        fixed_desc = dimension_key(fixed) if fixed else "el resto del trafico"
        checks.append((
            dim_name,
            f"control: {dim_name}={control_value} (con {fixed_desc}) aprueba {control_rate:.0%} "
            f"en la misma ventana -> la caida no es generica de {fixed_desc}"
        ))
    return checks


def generate_candidates(
    anomaly_id: str,
    history: list[Transaction],
    current_window: list[Transaction],
    anomaly_window_minutes: float,
    max_dims: int = 2,
) -> tuple[list[IncidentCandidate], list[Evidence]]:
    """Busca, entre combinaciones de 1 y 2 dimensiones, cual explica mejor la caida observada
    en `current_window`. Devuelve los candidatos ordenados por rca_score descendente (el
    primero es la mejor hipotesis) y toda la evidencia generada."""
    # cuanto "exceso" de rechazos hay en TODA la ventana, comparado contra el baseline global --
    # es el denominador de "cobertura": que fraccion de ese exceso explica cada candidato.
    global_baseline = compute_baseline(history, {}, current_window[0].timestamp, current_window[-1].timestamp)
    total_declined = sum(1 for t in current_window if not t.approved)
    expected_declined = (1 - global_baseline.expected_approval_rate) * len(current_window)
    total_excess = max(1.0, total_declined - expected_declined)

    candidates: list[IncidentCandidate] = []
    evidence: list[Evidence] = []

    # recorre todas las combinaciones de 1 y 2 dimensiones (ej. solo "provider", despues
    # "provider"+"country", etc.) y dentro de cada una, todos los valores que aparecen
    for n_dims in range(1, max_dims + 1):
        for dims_combo in itertools.combinations(SEGMENT_DIMENSIONS, n_dims):
            values_per_dim = {
                d: sorted({getattr(t, d) for t in current_window if getattr(t, d, None) is not None})
                for d in dims_combo
            }
            if not all(values_per_dim.values()):
                continue

            for values in itertools.product(*values_per_dim.values()):
                dims = dict(zip(dims_combo, values))
                segment_current = [t for t in current_window if _matches(t, dims)]
                if len(segment_current) < MIN_SEGMENT_VOLUME:
                    continue

                segment_history = [t for t in history if _matches(t, dims)]
                baseline = compute_baseline(segment_history, dims, current_window[0].timestamp, current_window[-1].timestamp)
                current_decline = _decline_rate(segment_current)
                baseline_decline = 1 - baseline.expected_approval_rate
                current_approval = 1 - current_decline

                # significativo = fuera del intervalo de credibilidad del baseline, no un
                # umbral fijo -- los segmentos chicos (intervalo mas ancho) necesitan una caida
                # mas clara para calificar, los grandes (intervalo angosto) no (D001).
                if current_approval >= baseline.credible_interval[0]:
                    continue

                affected_count = sum(1 for t in segment_current if not t.approved)
                # confianza: cuanto crecio el rechazo respecto al propio baseline del segmento
                confidence = round(min(0.99, (current_decline - baseline_decline) / max(current_decline, 0.01)), 4)

                # cobertura: que fraccion del exceso de rechazos GLOBAL explica este segmento
                segment_excess = max(0.0, affected_count - baseline_decline * len(segment_current))
                coverage = round(min(1.0, segment_excess / total_excess), 4)

                ev = Evidence(
                    evidence_id=f"ev_{uuid.uuid4().hex[:8]}",
                    source="baseline_comparison",
                    summary=(
                        f"{dimension_key(dims)}: rechazo subio de {baseline_decline:.0%} a "
                        f"{current_decline:.0%} ({affected_count} transacciones afectadas)"
                    ),
                    value=round(current_decline - baseline_decline, 4),
                    dimension_key=dimension_key(dims),
                )
                evidence.append(ev)
                evidence_ids = [ev.evidence_id]

                # un control por cada dimension del candidato (ver docstring de la funcion)
                counterfactual_checks = _counterfactual_checks(current_window, dims)
                counterfactual_texts = []
                for _dim_name, text in counterfactual_checks:
                    cf_ev = Evidence(
                        evidence_id=f"ev_{uuid.uuid4().hex[:8]}",
                        source="counterfactual_provider",
                        summary=text,
                        dimension_key=dimension_key(dims),
                    )
                    evidence.append(cf_ev)
                    evidence_ids.append(cf_ev.evidence_id)
                    counterfactual_texts.append(text)
                counterfactual = " | ".join(counterfactual_texts) if counterfactual_texts else None

                revenue_loss = _estimate_revenue_loss_per_hour(segment_current, 1 - baseline_decline, anomaly_window_minutes)

                candidates.append(IncidentCandidate(
                    candidate_id=f"cand_{uuid.uuid4().hex[:8]}",
                    anomaly_id=anomaly_id,
                    dimensions=dims,
                    confidence=confidence,
                    affected_count=affected_count,
                    baseline_decline_rate=round(baseline_decline, 4),
                    current_decline_rate=round(current_decline, 4),
                    dominant_decline_code=_dominant_decline_code(segment_current),
                    estimated_revenue_loss_usd_per_hour=revenue_loss,
                    rca_score=_rca_score(confidence, coverage, revenue_loss, n_dims),
                    evidence_ids=evidence_ids,
                    counterfactual_check=counterfactual,
                ))

    candidates.sort(key=lambda c: c.rca_score, reverse=True)
    return candidates, evidence
