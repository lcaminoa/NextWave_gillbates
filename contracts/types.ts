// Contratos compartidos — Control Tower
// Fuente de verdad: NEXTWAVE_CH2_CONTROL_TOWER_MASTER_PLAN_ES.md, secciones 12, 19 y 20.
// Espejo de schemas.py. Si cambiás algo acá, cambialo también allá. Ver CONTRACTS.md.
//
// Pipeline: Transaction (Stream A) -> BaselinePoint + Anomaly (Stream B) -> IncidentCandidate
//           + Evidence (Stream B) -> InvestigationStep + IncidentReport (Stream C)
//           ChaosSpec fluye Stream D -> Stream A (inyección) y Stream A -> Stream D (reveal).
//
// Naming: snake_case en TODOS los campos, en los dos lenguajes — evita traducir entre el
// dashboard (TS) y el engine (Python) en pleno hackathon.

export type Severity = "low" | "medium" | "high" | "critical";
export type ReportStatus = "confirmed" | "probable" | "inconclusive";
export type ChaosMode = "manual" | "random_unknown";

export interface Dimensions {
  merchant?: string;
  provider?: string;
  payment_method?: string;
  country?: string;
  issuing_bank?: string;
  canonical_decline_code?: string;
}

/** Un pago individual del stream simulado (Stream A). MUST. */
export interface Transaction {
  transaction_id: string;
  timestamp: string; // ISO 8601
  merchant: string;
  provider: string;
  payment_method: string; // "card" | "pix" | "pse" | "wallet"
  country: string; // ISO 3166-1 alpha-2, ej. "BR"
  issuing_bank: string;
  approved: boolean;
  amount: number;
  currency: string; // ISO 4217, ej. "USD"
  // Los 3 siguientes solo están presentes si approved === false:
  raw_provider_code?: string; // código crudo tal cual lo manda el proveedor, ej. "05"
  raw_provider_message?: string; // ej. "DO NOT HONOR"
  canonical_decline_code?: string; // normalizado — ver la lista en CONTRACTS.md
  latency_ms: number;
}

/**
 * El baseline esperado para un segmento en una ventana (Stream B). MUST.
 * Modelo Beta-Binomial: la aprobación es una proporción, no un valor puntual — por eso lleva
 * intervalo de credibilidad, no solo un número.
 */
export interface BaselinePoint {
  dimension_key: string; // clave canónica, ej. "provider=nova_pay|country=BR|payment_method=card"
  window_start: string; // ISO 8601
  window_end: string; // ISO 8601
  expected_approval_rate: number; // 0-1
  credible_interval: [number, number]; // ej. [0.90, 0.96]
  volume: number; // intentos usados para estimar el baseline
}

/**
 * Señal estadística cruda de que algo cambió (Stream B). MUST.
 * A propósito no dice todavía la causa — eso lo arma IncidentCandidate.
 */
export interface Anomaly {
  anomaly_id: string;
  detected_at: string; // ISO 8601
  dimension_key: string; // "global" o el segmento donde se vio primero
  window_start: string;
  window_end: string;
  observed_approval_rate: number; // 0-1
  expected_approval_rate: number; // 0-1
  persistence_windows: number; // ventanas consecutivas sostenidas (evita alarmar por 1 pago)
  volume: number;
  severity: Severity;
  // SHOULD — descomposición de mezcla de tráfico (master plan §9.3): cuánto de la caída
  // agregada es cambio de composición del tráfico vs. degradación real dentro del segmento.
  mix_shift_effect_pp?: number;
  performance_effect_pp?: number;
}

/** Un dato concreto citable (Stream B/C). MUST. */
export interface Evidence {
  evidence_id: string;
  source: string; // ej. "baseline_comparison" | "counterfactual_provider" | "decline_code_distribution"
  summary: string; // en lenguaje humano
  value?: number;
  dimension_key?: string;
}

/**
 * Una hipótesis sobre qué segmento explica una Anomaly (Stream B). MUST. Puede haber varias
 * por Anomaly — el investigador (Stream C) elige la ganadora.
 */
export interface IncidentCandidate {
  candidate_id: string;
  anomaly_id: string;
  dimensions: Dimensions;
  confidence: number; // 0-1
  affected_count: number;
  baseline_decline_rate: number; // 0-1, dentro de esta combinación de dimensiones
  current_decline_rate: number; // 0-1
  dominant_decline_code?: string;
  estimated_revenue_loss_usd_per_hour: number;
  // impacto_de_negocio × confianza_estadística × cobertura × especificidad - penalización (§9.4)
  rca_score: number;
  evidence_ids: string[];
  // SHOULD — control contrafáctico entre proveedores/emisores (§9.5)
  counterfactual_check?: string;
}

/** Un paso del agente investigador trabajando (Stream C). MUST — es lo que se muestra en vivo. */
export interface InvestigationStep {
  step_id: string;
  candidate_id: string; // o anomaly_id si el paso es exploratorio, previo a tener candidatos
  timestamp: string; // ISO 8601
  action: string; // ej. "query_segment(provider=nova_pay, country=BR)"
  result_summary: string;
}

/** Una afirmación del reporte, siempre atada a evidencia — nunca una frase suelta (§9.8). */
export interface Claim {
  claim: string;
  evidence_ids: string[];
  confidence: number; // 0-1
}

/**
 * El resultado final (Stream C). MUST. Nunca ejecuta recommended_action, solo la sugiere.
 * status tiene 3 valores a propósito (§9.9) — "inconclusive" es una respuesta válida, no un error.
 */
export interface IncidentReport {
  incident_id: string;
  anomaly_id: string;
  generated_at: string; // ISO 8601
  status: ReportStatus;
  winning_candidate_id?: string; // ausente si status === "inconclusive"
  summary: string; // en lenguaje humano
  claims: Claim[];
  estimated_revenue_loss_usd_per_hour: number; // tasa, no un acumulado (ver DECISIONS.md)
  recommended_action: string; // sugerida, nunca ejecutada por el sistema
  requires_human_review: boolean;
  investigation_steps: string[]; // ids de InvestigationStep, en orden
  matches_past_incident_id?: string; // SHOULD — memoria histórica (§9.10)
}

/** Lo que maneja el Chaos Injector / judge console (Stream D <-> Stream A). MUST. */
export interface ChaosSpec {
  chaos_id: string;
  mode: ChaosMode;
  // En modo "random_unknown" esto existe en el simulador pero se oculta del equipo/UI hasta
  // que se llame POST /api/chaos/reveal — esa es la prueba de que la demo no está hardcodeada.
  dimensions?: Dimensions;
  severity_pp: number; // degradación en puntos porcentuales, ej. -5 a -50
  started_at: string; // ISO 8601
  duration_minutes?: number; // ausente = continua hasta nuevo chaos
  revealed: boolean;
}
