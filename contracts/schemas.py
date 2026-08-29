"""Contratos compartidos — Control Tower.

Fuente de verdad: NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN_ES.md, secciones 12, 19 y 20.
Espejo de types.ts. Si cambiás algo acá, cambialo también allá. Ver CONTRACTS.md.

Pipeline: Transaction (Stream A) -> BaselinePoint + Anomaly (Stream B) -> IncidentCandidate
          + Evidence (Stream B) -> InvestigationStep + IncidentReport (Stream C)
          ChaosSpec fluye Stream D -> Stream A (inyeccion) y Stream A -> Stream D (reveal).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# --- Enums: estos campos solo pueden valer una de las opciones listadas ---

class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class ReportStatus(str, Enum):
    confirmed = "confirmed"
    probable = "probable"
    inconclusive = "inconclusive"  # respuesta valida, no un error (Sec 9.9)


class ChaosMode(str, Enum):
    manual = "manual"  # el juez elige a mano que romper
    random_unknown = "random_unknown"  # se rompe algo al azar y queda oculto hasta el reveal


class Dimensions(BaseModel):
    """Combo de hasta 6 campos, todos opcionales. Se usa para decir "el problema esta en ESTA
    combinacion", ej. Dimensions(provider="nova_pay", country="BR")."""

    merchant: Optional[str] = None
    provider: Optional[str] = None
    payment_method: Optional[str] = None
    country: Optional[str] = None
    issuing_bank: Optional[str] = None
    canonical_decline_code: Optional[str] = None


class Transaction(BaseModel):
    """Un pago individual del stream simulado (Stream A). MUST."""

    transaction_id: str  # id unico
    timestamp: datetime
    merchant: str
    provider: str
    payment_method: str  # "card" | "pix" | "pse" | "wallet"
    country: str  # ISO 3166-1 alpha-2, ej. "BR"
    issuing_bank: str
    approved: bool
    amount: float
    currency: str  # ISO 4217, ej. "USD"

    # Los 3 siguientes solo estan presentes si approved is False:
    raw_provider_code: Optional[str] = None  # codigo crudo tal cual lo manda el proveedor, ej. "05"
    raw_provider_message: Optional[str] = None  # ej. "DO NOT HONOR"
    canonical_decline_code: Optional[str] = None  # normalizado, ver lista en CONTRACTS.md
    latency_ms: int


class BaselinePoint(BaseModel):
    """El baseline esperado para un segmento en una ventana (Stream B). MUST.

    Modelo Beta-Binomial: la aprobacion es una proporcion, no un valor puntual -- por eso lleva
    intervalo de credibilidad, no solo un numero.
    """

    dimension_key: str  # ej. "provider=nova_pay|country=BR|payment_method=card"
    window_start: datetime
    window_end: datetime
    expected_approval_rate: float = Field(ge=0, le=1)
    credible_interval: tuple[float, float]  # ej. (0.90, 0.96)
    volume: int  # intentos usados para estimar el baseline


class Anomaly(BaseModel):
    """Señal estadistica cruda de que algo cambio (Stream B). MUST.

    A proposito no dice todavia la causa -- eso lo arma IncidentCandidate.
    """

    anomaly_id: str
    detected_at: datetime
    dimension_key: str  # "global" o el segmento donde se vio primero
    window_start: datetime
    window_end: datetime
    observed_approval_rate: float = Field(ge=0, le=1)
    expected_approval_rate: float = Field(ge=0, le=1)
    persistence_windows: int  # ventanas consecutivas sostenidas (evita alarmar por 1 pago suelto)
    volume: int
    severity: Severity
    # SHOULD -- descomposicion de mezcla de trafico (master plan Sec 9.3)
    mix_shift_effect_pp: Optional[float] = None
    performance_effect_pp: Optional[float] = None


class Evidence(BaseModel):
    """Un dato concreto citable (Stream B/C). MUST."""

    evidence_id: str
    source: str  # ej. "baseline_comparison" | "counterfactual_provider" | "decline_code_distribution"
    summary: str  # en lenguaje humano
    value: Optional[float] = None
    dimension_key: Optional[str] = None


class IncidentCandidate(BaseModel):
    """Una hipotesis sobre que segmento explica una Anomaly (Stream B). MUST.

    Puede haber varias por Anomaly -- el investigador (Stream C) elige la ganadora.
    """

    candidate_id: str
    anomaly_id: str
    dimensions: Dimensions  # ej. {provider: "nova_pay", country: "BR"}
    confidence: float = Field(ge=0, le=1)
    affected_count: int
    baseline_decline_rate: float = Field(ge=0, le=1)
    current_decline_rate: float = Field(ge=0, le=1)
    dominant_decline_code: Optional[str] = None
    estimated_revenue_loss_usd_per_hour: float
    # confianza x cobertura x impacto_de_negocio x especificidad (Sec 9.4)
    rca_score: float
    evidence_ids: list[str]
    # SHOULD -- control contrafactico entre proveedores/emisores (Sec 9.5)
    counterfactual_check: Optional[str] = None


class InvestigationStep(BaseModel):
    """Un paso del agente investigador trabajando (Stream C). MUST -- se muestra en vivo."""

    step_id: str
    candidate_id: str  # o anomaly_id si el paso es exploratorio
    timestamp: datetime
    action: str  # ej. "query_segment(provider=nova_pay, country=BR)"
    result_summary: str


class Claim(BaseModel):
    """Una afirmacion del reporte, siempre atada a evidencia -- nunca una frase suelta (Sec 9.8)."""

    claim: str
    evidence_ids: list[str]
    confidence: float = Field(ge=0, le=1)


class IncidentReport(BaseModel):
    """El resultado final (Stream C). MUST.

    Nunca ejecuta recommended_action, solo la sugiere. status tiene 3 valores a proposito
    (Sec 9.9) -- "inconclusive" es una respuesta valida, no un error.
    """

    incident_id: str
    anomaly_id: str
    generated_at: datetime
    status: ReportStatus
    winning_candidate_id: Optional[str] = None  # ausente si status == inconclusive
    summary: str  # en lenguaje humano
    claims: list[Claim]
    estimated_revenue_loss_usd: float
    recommended_action: str  # sugerida, nunca ejecutada por el sistema
    requires_human_review: bool
    investigation_steps: list[str]  # ids de InvestigationStep, en orden
    matches_past_incident_id: Optional[str] = None  # SHOULD -- memoria historica (Sec 9.10)


class ChaosSpec(BaseModel):
    """Lo que maneja el Chaos Injector / judge console cuando quiere romper algo a proposito
    (Stream D <-> Stream A). MUST."""

    chaos_id: str
    mode: ChaosMode
    # En modo random_unknown esto existe en el simulador pero se oculta hasta
    # POST /api/chaos/reveal -- esa es la prueba de que la demo no esta hardcodeada.
    dimensions: Optional[Dimensions] = None
    severity_pp: float  # degradacion en puntos porcentuales, ej. -5 a -50
    started_at: datetime
    duration_minutes: Optional[int] = None  # ausente = continua hasta nuevo chaos
    revealed: bool
