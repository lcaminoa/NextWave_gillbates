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
  return postJson<ChaosSpec>("/api/chaos/inject", spec);
}

export function injectRandomChaos(spec: RandomChaosRequest) {
  return postJson<ChaosSpec>("/api/chaos/random", spec);
}

export function revealChaos(chaosId?: string) {
  return postJson<ChaosSpec>("/api/chaos/reveal", chaosId ? { chaos_id: chaosId } : undefined);
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiOrigin + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ControlTowerError("PHAROS runtime unavailable (" + response.status + ")", response.status);
  }
  return response.json() as Promise<T>;
}
