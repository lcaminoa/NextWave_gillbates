import type { NotificationDispatch } from "@/lib/notifications";
import type {
  ChaosSpec,
  Evidence,
  IncidentCandidate,
  IncidentReport,
  InvestigationStep,
  Transaction,
} from "@/lib/contracts";

export type IncidentDetail = {
  report: IncidentReport;
  candidates: IncidentCandidate[];
  evidence: Evidence[];
  investigation_steps: InvestigationStep[];
  /**
   * Optional on purpose: an older runtime build answers this route without the
   * audit gate at all. Typing it as always-present made the detail screen crash
   * on the first property read instead of reporting what the runtime withheld.
   */
  evidence_audit?: EvidenceAuditView | null;
  /** What became of each external alert. Empty when nothing was ever queued. */
  notification_dispatches?: NotificationDispatch[];
};

export type EvidenceAuditStatus = "approved" | "rejected" | "error" | "not_run";
export type EvidenceAuditCheckStatus = "pass" | "fail" | "not_applicable";

export type EvidenceAuditIssue = {
  code: "unsupported_claim" | "overstated_confidence" | "missing_counterfactual" | "unsafe_recommendation" | "inconsistent_report" | "other";
  message: string;
  claim_index?: number | null;
  evidence_ids: string[];
};

export type EvidenceAuditCheck = {
  code: string;
  label: string;
  status: EvidenceAuditCheckStatus;
  detail: string;
};

export type EvidenceAuditView = {
  status: EvidenceAuditStatus;
  summary: string;
  issues: EvidenceAuditIssue[];
  claims_reviewed: number;
  evidence_reviewed: number;
  requires_human_review: true;
  action_executed: false;
  checks: EvidenceAuditCheck[];
};

export type BlindTrialOutcome = "exact" | "partial" | "over_specific" | "mixed" | "incorrect" | "inconclusive" | "no_report" | "ambiguous";

export type DimensionConflict = { truth: string; diagnosed: string };

export type BlindTrialEvaluation = {
  chaos_id: string;
  incident_id?: string | null;
  outcome: BlindTrialOutcome;
  truth_dimensions: Record<string, string>;
  diagnosed_dimensions: Record<string, string>;
  matching_dimensions: Record<string, string>;
  missing_dimensions: Record<string, string>;
  extra_dimensions: Record<string, string>;
  conflicting_dimensions: Record<string, DimensionConflict>;
  injected_degradation_pp: number;
  estimated_degradation_pp?: number | null;
  severity_error_pp?: number | null;
  detection_latency_seconds?: number | null;
  explanation_latency_seconds?: number | null;
  investigation_latency_seconds?: number | null;
  structural_evidence_valid: boolean;
  evidence_audit_status: EvidenceAuditStatus;
  abstention_assessment: "justified" | "unverified" | "not_applicable";
  human_review_required: true;
  action_executed: false;
};

export type ChaosRevealResponse = ChaosSpec & {
  evaluation?: BlindTrialEvaluation | null;
};

export type RandomChaosRequest = Pick<ChaosSpec, "severity_pp" | "duration_minutes">;

const apiOrigin = process.env.NEXT_PUBLIC_CONTROL_TOWER_API_ORIGIN ?? "";

/**
 * Carries the HTTP status alongside the message. Purely additive: the message and
 * the throwing behaviour are unchanged, so existing callers keep working. It lets
 * the UI tell "the runtime is down" apart from "the runtime answered, and this
 * incident does not exist" instead of showing one error for both.
 */
export class ControlTowerError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ControlTowerError";
    this.status = status;
  }
}

/**
 * Recovers the HTTP status from an error message that has already been flattened
 * to a string by the hooks. Lets a screen separate "this incident does not exist"
 * from "the runtime is unreachable" without changing the live hook contract.
 */
export function statusFromErrorMessage(message?: string | null) {
  const match = message?.match(/\((\d{3})\)\s*$/);
  return match ? Number(match[1]) : undefined;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiOrigin + path, { cache: "no-store" });
  if (!response.ok) {
    throw new ControlTowerError("PHAROS runtime unavailable (" + response.status + ")", response.status);
  }
  return response.json() as Promise<T>;
}

export function getIncidentReports() {
  return getJson<IncidentReport[]>("/api/incidents");
}

export function getIncidentDetail(incidentId: string) {
  return getJson<IncidentDetail>("/api/incidents/" + incidentId);
}

export function connectTransactionStream(
  onTransaction: (transaction: Transaction) => void,
  onError: () => void,
) {
  const source = new EventSource(apiOrigin + "/api/stream");
  source.addEventListener("transaction", (event) => {
    onTransaction(JSON.parse(event.data) as Transaction);
  });
  source.onerror = onError;
  return () => source.close();
}

export function injectChaos(spec: ChaosSpec) {
  return postChaosJson<ChaosSpec>("/api/chaos/inject", spec);
}

export function injectRandomChaos(spec: RandomChaosRequest) {
  return postChaosJson<ChaosSpec>("/api/chaos/random", spec);
}

export function revealChaos(chaosId?: string) {
  return postChaosJson<ChaosRevealResponse>("/api/chaos/reveal", chaosId ? { chaos_id: chaosId } : undefined);
}

async function postChaosJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ControlTowerError("PHAROS runtime unavailable (" + response.status + ")", response.status);
  }
  return response.json() as Promise<T>;
}
