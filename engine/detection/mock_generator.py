"""Generador de transacciones falsas para probar Stream B aislado (AGENTS.md: "cada stream
avanza aislado con mocks"). No depende del simulador real de Stream A todavia.

Aprobacion base por metodo de pago tomada del master plan (Sec 13), mas ruido natural, mas
un ChaosSpec opcional para simular un incidente real.
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta

from contracts.schemas import ChaosMode, ChaosSpec, Dimensions, Transaction

# --- "Mundo falso": catalogos fijos de donde se elige al azar ---
MERCHANTS = ["VuelaYa", "Comercio1", "Comercio2", "Comercio3", "TiendaNorte"]
PROVIDERS = ["nova_pay", "atlas_pay", "stripe", "adyen"]
COUNTRIES = ["BR", "MX", "CO", "AR"]
PAYMENT_METHODS_BY_COUNTRY = {  # no todos los metodos existen en todos los paises
    "BR": ["card", "pix"],
    "MX": ["card", "wallet"],
    "CO": ["card", "pse"],
    "AR": ["card", "wallet"],
}
ISSUING_BANKS_BY_COUNTRY = {
    "BR": ["itau", "nubank", "bradesco"],
    "MX": ["bbva_mx", "banorte", "santander_mx"],
    "CO": ["bancolombia", "davivienda"],
    "AR": ["galicia", "santander_ar", "bbva_ar"],
}
DECLINE_CODES = [
    "insufficient_funds", "do_not_honor", "issuer_unavailable",
    "suspected_fraud", "authentication_required", "provider_timeout", "invalid_data",
]
RAW_CODE_BY_DECLINE = {  # motivo "lindo" -> codigo numerico como lo daria un proveedor real
    "insufficient_funds": "51", "do_not_honor": "05", "issuer_unavailable": "91",
    "suspected_fraud": "59", "authentication_required": "65",
    "provider_timeout": "68", "invalid_data": "12",
}

# Aprobacion "sana" por metodo de pago (master plan Sec 13) antes de ruido/hora/chaos.
BASE_APPROVAL_RATE = {"pix": 0.98, "card": 0.88, "pse": 0.93, "wallet": 0.96}


def _hour_factor(ts: datetime) -> float:
    """Multiplicador chico segun hora/dia: fin de semana y madrugada aprueban un poco menos."""
    weekday_factor = 0.98 if ts.weekday() >= 5 else 1.0  # sabado/domingo
    night_factor = 0.97 if ts.hour < 6 else 1.0  # antes de las 6am
    return weekday_factor * night_factor


def _matches_chaos(dims: dict, chaos: ChaosSpec) -> bool:
    """True si esta transaccion cae dentro del segmento que el chaos esta atacando."""
    if not chaos.dimensions:
        return False
    chaos_dims = chaos.dimensions.model_dump(exclude_none=True)
    if not chaos_dims:
        return False
    return all(dims.get(k) == v for k, v in chaos_dims.items())


def _chaos_active(ts: datetime, chaos: ChaosSpec) -> bool:
    """True si a esta hora el chaos ya arranco y todavia no termino."""
    if ts < chaos.started_at:
        return False
    if chaos.duration_minutes is None:
        return True  # sin duracion = sigue indefinidamente
    return ts <= chaos.started_at + timedelta(minutes=chaos.duration_minutes)


def generate_stream(start: datetime, n: int, interval_seconds: float = 1.0, chaos: ChaosSpec | None = None,
                    seed: int | None = None) -> list[Transaction]:
    """Genera `n` transacciones consecutivas desde `start`. Si `chaos` esta activo y matchea
    las dimensiones de una transaccion, le baja la probabilidad de aprobacion en
    `chaos.severity_pp` puntos porcentuales.
    """
    rng = random.Random(seed)  # seed fija = mismos datos "al azar" en cada corrida, util para testear
    transactions: list[Transaction] = []
    ts = start

    for _ in range(n):
        merchant = rng.choice(MERCHANTS)
        provider = rng.choice(PROVIDERS)
        country = rng.choice(COUNTRIES)
        payment_method = rng.choice(PAYMENT_METHODS_BY_COUNTRY[country])  # restringido al pais
        issuing_bank = rng.choice(ISSUING_BANKS_BY_COUNTRY[country])

        dims = {
            "merchant": merchant, "provider": provider, "payment_method": payment_method,
            "country": country, "issuing_bank": issuing_bank,
        }

        # probabilidad de aprobacion de ESTA transaccion: base del metodo + factor hora/dia + ruido
        approval_rate = BASE_APPROVAL_RATE[payment_method] * _hour_factor(ts)
        approval_rate = max(0.05, min(0.995, approval_rate + rng.uniform(-0.02, 0.02)))

        forced_code = None
        if chaos is not None and _chaos_active(ts, chaos) and _matches_chaos(dims, chaos):
            approval_rate = max(0.01, approval_rate - chaos.severity_pp / 100.0)
            forced_code = "issuer_unavailable"  # motivo realista para "el proveedor no responde"

        approved = rng.random() < approval_rate  # moneda cargada segun esa probabilidad

        decline_code = raw_code = raw_message = None
        if not approved:
            decline_code = forced_code or rng.choice(DECLINE_CODES)
            raw_code = RAW_CODE_BY_DECLINE.get(decline_code, "05")
            raw_message = decline_code.replace("_", " ").upper()

        transactions.append(Transaction(
            transaction_id=f"txn_{uuid.uuid4().hex[:10]}",
            timestamp=ts,
            merchant=merchant,
            provider=provider,
            payment_method=payment_method,
            country=country,
            issuing_bank=issuing_bank,
            approved=approved,
            amount=round(rng.uniform(15, 400), 2),
            currency="USD",
            raw_provider_code=raw_code,
            raw_provider_message=raw_message,
            canonical_decline_code=decline_code,
            latency_ms=rng.randint(120, 900),
        ))
        ts = ts + timedelta(seconds=interval_seconds)

    return transactions


def make_chaos(
    provider: str | None = None,
    country: str | None = None,
    payment_method: str | None = None,
    issuing_bank: str | None = None,
    merchant: str | None = None,
    severity_pp: float = 35.0,
    started_at: datetime | None = None,
    duration_minutes: int | None = None,
    mode: str = "manual",
) -> ChaosSpec:
    """Atajo para armar un ChaosSpec de prueba -- lo que en produccion mandaria la judge
    console via POST /api/chaos/inject o /api/chaos/random."""
    return ChaosSpec(
        chaos_id=f"chaos_{uuid.uuid4().hex[:8]}",
        mode=ChaosMode(mode),
        dimensions=Dimensions(
            provider=provider, country=country, payment_method=payment_method,
            issuing_bank=issuing_bank, merchant=merchant,
        ),
        severity_pp=severity_pp,
        started_at=started_at or datetime.utcnow(),
        duration_minutes=duration_minutes,
        revealed=(mode == "manual"),  # random_unknown se revela recien en el POST /reveal
    )
