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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiOrigin + path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Control Tower API unavailable (" + response.status + ")");
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
    throw new Error("Control Tower API unavailable (" + response.status + ")");
  }
  return response.json() as Promise<T>;
}
