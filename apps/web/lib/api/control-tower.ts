import type { IncidentReport, Transaction } from "@/lib/contracts";
import type { ChaosSpec } from "@/lib/contracts";

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

export function getIncidentReport(incidentId: string) {
  return getJson<IncidentReport>("/api/incidents/" + incidentId);
}

export function connectTransactionStream(
  onTransaction: (transaction: Transaction) => void,
  onError: () => void,
) {
  const source = new EventSource(apiOrigin + "/api/stream");
  source.onmessage = (event) => onTransaction(JSON.parse(event.data) as Transaction);
  source.onerror = onError;
  return () => source.close();
}

export function injectChaos(spec: ChaosSpec) {
  return postJson<ChaosSpec>("/api/chaos/inject", spec);
}

export function injectRandomChaos(spec: ChaosSpec) {
  return postJson<ChaosSpec>("/api/chaos/random", spec);
}

export function revealChaos() {
  return postJson<ChaosSpec>("/api/chaos/reveal");
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
