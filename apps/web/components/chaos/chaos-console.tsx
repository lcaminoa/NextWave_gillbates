"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import {
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  Eye,
  EyeOff,
  FlaskConical,
  Gauge,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Play,
  RotateCcw,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { injectChaos, injectRandomChaos, revealChaos } from "@/lib/api/control-tower";
import { useIncidentReports } from "@/lib/api/use-control-tower";
import type { ChaosSpec, Dimensions } from "@/lib/contracts";
import { dimensionLabel, dimensionValueLabel, type DimensionField } from "@/lib/dimensions";
import { DISPLAY_TIME_ZONE_LABEL, time } from "@/lib/format";

type ChaosPhase = "ready" | "confirming" | "submitting" | "active" | "revealing" | "revealed" | "failed";
type ChaosMode = ChaosSpec["mode"];

/**
 * The values this console is allowed to inject. Deliberately kept as its own list
 * rather than the full catalogue: widening what a judge can submit is a functional
 * change to the manual mode, which has a known open limitation (docs/TODO.md).
 * Only the labels come from the shared dictionary, so the injector and the
 * incident workspace finally name the same thing the same way.
 */
const injectableValues: Record<DimensionField, string[]> = {
  merchant: ["VuelaYa", "Comercio1", "TiendaNorte"],
  provider: ["nova_pay", "atlas_pay", "stripe", "adyen"],
  payment_method: ["card", "pix", "wallet", "pse"],
  country: ["BR", "MX", "CO", "AR"],
  issuing_bank: ["itau", "nubank", "bbva_mx", "galicia"],
  canonical_decline_code: ["do_not_honor", "issuer_unavailable", "provider_timeout"],
};

const dimensionOrder: DimensionField[] = [
  "merchant",
  "provider",
  "payment_method",
  "country",
  "issuing_bank",
  "canonical_decline_code",
];

const CHAOS_RUN_STORAGE_KEY = "pharos.active-chaos-run";

type StoredChaosRun = {
  runSpec: ChaosSpec;
  clientStartedAtMs: number | null;
};

function restoreChaosRun(): StoredChaosRun | null {
  try {
    const raw = window.sessionStorage.getItem(CHAOS_RUN_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as {
      runSpec?: Partial<ChaosSpec>;
      clientStartedAtMs?: unknown;
    } & Partial<ChaosSpec>;
    // Backward compatibility with runs saved before elapsed time was persisted.
    const run = stored.runSpec ?? stored;
    if (
      typeof run.chaos_id !== "string"
      || (run.mode !== "manual" && run.mode !== "random_unknown")
      || typeof run.revealed !== "boolean"
    ) {
      window.sessionStorage.removeItem(CHAOS_RUN_STORAGE_KEY);
      return null;
    }
    return {
      runSpec: run as ChaosSpec,
      clientStartedAtMs: (
        typeof stored.clientStartedAtMs === "number"
        && Number.isFinite(stored.clientStartedAtMs)
        ? stored.clientStartedAtMs
        : null
      ),
    };
  } catch {
    window.sessionStorage.removeItem(CHAOS_RUN_STORAGE_KEY);
    return null;
  }
}

function elapsedLabel(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/** "Sealed" is the honest reading of a dimension the runtime has not revealed. */
function displayValue(field: DimensionField, value?: string) {
  return dimensionValueLabel(field, value) ?? "Sealed";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The PHAROS runtime rejected the request.";
}

export function ChaosConsole() {
  const [mode, setMode] = useState<ChaosMode>("manual");
  const [dimensions, setDimensions] = useState<Dimensions>({
    merchant: "VuelaYa",
    provider: "nova_pay",
    payment_method: "card",
    country: "BR",
    issuing_bank: "itau",
    canonical_decline_code: "do_not_honor",
  });
  const [severity, setSeverity] = useState(-25);
  const [duration, setDuration] = useState(20);
  const [phase, setPhase] = useState<ChaosPhase>("ready");
  const [runSpec, setRunSpec] = useState<ChaosSpec | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clientStartedAtMs, setClientStartedAtMs] = useState<number | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [restoredRunState, setRestoredRunState] = useState(false);
  const { reports, status: reportsStatus } = useIncidentReports(5_000);

  const controlsLocked = !["ready", "confirming", "failed"].includes(phase);
  const isRandom = mode === "random_unknown";
  const isRunning = ["submitting", "active", "revealing"].includes(phase);

  useEffect(() => {
    const restored = restoreChaosRun();
    startTransition(() => {
      if (restored) {
        setRunSpec(restored.runSpec);
        setMode(restored.runSpec.mode);
        setSeverity(restored.runSpec.severity_pp);
        if (typeof restored.runSpec.duration_minutes === "number") {
          setDuration(restored.runSpec.duration_minutes);
        }
        setPhase(restored.runSpec.revealed ? "revealed" : "active");
        setClientStartedAtMs(restored.clientStartedAtMs);
        if (restored.clientStartedAtMs !== null) {
          setElapsedSeconds(Math.max(0, Math.floor((Date.now() - restored.clientStartedAtMs) / 1_000)));
        }
      }
      setRestoredRunState(true);
    });
  }, []);

  useEffect(() => {
    if (!restoredRunState) return;
    if (runSpec) {
      window.sessionStorage.setItem(
        CHAOS_RUN_STORAGE_KEY,
        JSON.stringify({ runSpec, clientStartedAtMs }),
      );
    } else {
      window.sessionStorage.removeItem(CHAOS_RUN_STORAGE_KEY);
    }
  }, [clientStartedAtMs, restoredRunState, runSpec]);

  useEffect(() => {
    if (!runSpec || !isRunning) return;
    const interval = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1_000);
    return () => window.clearInterval(interval);
  }, [isRunning, runSpec]);

  const updateDimension = (field: DimensionField, value: string) =>
    setDimensions((current) => ({ ...current, [field]: value }));

  const selectMode = (nextMode: ChaosMode) => {
    if (controlsLocked) return;
    setMode(nextMode);
    setPhase("ready");
    setRequestError(null);
  };

  const confirmInjection = async () => {
    setPhase("submitting");
    setRequestError(null);
    try {
      const nextSpec = mode === "manual"
        ? await injectChaos({
            chaos_id: `chaos_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`,
            mode: "manual",
            dimensions,
            severity_pp: severity,
            started_at: new Date().toISOString(),
            duration_minutes: duration,
            revealed: true,
          })
        : await injectRandomChaos({ severity_pp: severity, duration_minutes: duration });
      setRunSpec(nextSpec);
      setSeverity(nextSpec.severity_pp);
      if (typeof nextSpec.duration_minutes === "number") {
        setDuration(nextSpec.duration_minutes);
      }
      setClientStartedAtMs(Date.now());
      setElapsedSeconds(0);
      setPhase("active");
    } catch (error) {
      setRequestError(errorMessage(error));
      setPhase("failed");
    }
  };

  const requestReveal = async () => {
    if (!runSpec) return;
    setPhase("revealing");
    setRequestError(null);
    try {
      setRunSpec(await revealChaos(runSpec.chaos_id));
      setPhase("revealed");
    } catch (error) {
      setRequestError(errorMessage(error));
      setPhase("failed");
    }
  };

  const reset = () => {
    setRunSpec(null);
    setClientStartedAtMs(null);
    setElapsedSeconds(0);
    setRequestError(null);
    setPhase("ready");
  };

  const phaseMeta: Record<ChaosPhase, { label: string; detail: string; tone: string }> = {
    ready: { label: "Ready", detail: "Scenario configuration is local until you confirm it.", tone: "neutral" },
    confirming: { label: "Review scenario", detail: "Confirm before the controlled run starts.", tone: "warning" },
    submitting: { label: "Submitting", detail: "Waiting for the PHAROS runtime to accept the scenario.", tone: "active" },
    active: { label: "Active in runtime", detail: "The scenario was accepted. Monitor the investigation queue for independently generated reports.", tone: "active" },
    revealing: { label: "Revealing", detail: "Retrieving the sealed ground truth from the runtime.", tone: "active" },
    revealed: { label: "Ground truth revealed", detail: "The injected scenario is visible for operator comparison.", tone: "complete" },
    failed: { label: "Request failed", detail: "No client-side state was treated as a successful injection.", tone: "warning" },
  };
  const meta = phaseMeta[phase];

  return (
    <div className="control-canvas chaos-canvas">
      <main className="mx-auto w-full max-w-none">
        <header className="chaos-header">
          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="live-pill">
                <FlaskConical className="size-3" aria-hidden="true" /> CHAOS LAB
              </span>
              <span className={`chaos-phase-pill chaos-phase-${meta.tone}`}>{meta.label}</span>
            </div>
            <h1 className="mt-3 text-display font-medium text-pharos-strong">
              Controlled chaos, <span className="text-pharos-accent">visible proof.</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-pharos-muted">
              Submit a controlled payment anomaly to the live engine. The UI records only API-confirmed state.
            </p>
          </div>
          <div className="chaos-header-meta relative z-10">
            <div>
              <span>Run source</span>
              <strong>PHAROS runtime</strong>
            </div>
            <div>
              <span>Execution</span>
              <strong>{runSpec ? elapsedLabel(elapsedSeconds) : "Not started"}</strong>
            </div>
            <div>
              <span>Integrity</span>
              <strong>{isRandom ? "Blind-safe" : "Operator defined"}</strong>
            </div>
          </div>
        </header>

        <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.48fr)_minmax(360px,0.82fr)]">
          <article className="chaos-config-card">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
              <div>
                <p className="eyebrow">Scenario configuration</p>
                <h2 className="mt-1 text-title font-medium text-pharos-ink">
                  {controlsLocked ? "Scenario locked for this run" : "Define the experiment"}
                </h2>
              </div>
              <div className="chaos-segmented-control" role="group" aria-label="Chaos mode">
                <button
                  type="button"
                  onClick={() => selectMode("manual")}
                  disabled={controlsLocked}
                  aria-pressed={mode === "manual"}
                  className={mode === "manual" ? "chaos-segment-active" : ""}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => selectMode("random_unknown")}
                  disabled={controlsLocked}
                  aria-pressed={isRandom}
                  className={isRandom ? "chaos-segment-active" : ""}
                >
                  Random unknown
                </button>
              </div>
            </div>

            <div className="border-t border-pharos-line p-5 md:p-6">
              {mode === "manual" ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {dimensionOrder.map((field) => (
                    <label key={field} className="chaos-field">
                      <span>{dimensionLabel(field)}</span>
                      <select
                        aria-label={dimensionLabel(field)}
                        value={dimensions[field] ?? ""}
                        disabled={controlsLocked}
                        onChange={(event) => updateDimension(field, event.target.value)}
                      >
                        {injectableValues[field].map((value) => (
                          <option key={value} value={value}>
                            {dimensionValueLabel(field, value)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="chaos-blind-state">
                  <EyeOff className="mt-0.5 size-5 shrink-0 text-signal-uncertain" aria-hidden="true" />
                  <div>
                    <p>Blind incident injection</p>
                    <span>
                      Ground truth remains hidden from the investigator and this UI until the runtime reveal
                      succeeds.
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <label className="chaos-range-field">
                  <div className="flex items-center justify-between gap-3">
                    <span>Severity</span>
                    <strong>{severity} pp</strong>
                  </div>
                  <input
                    aria-label="Chaos severity in percentage points"
                    type="range"
                    min="-50"
                    max="-5"
                    value={severity}
                    disabled={controlsLocked}
                    onChange={(event) => setSeverity(Number(event.target.value))}
                  />
                  <small>Approval-rate degradation</small>
                </label>
                <label className="chaos-range-field">
                  <div className="flex items-center justify-between gap-3">
                    <span>Duration</span>
                    <strong>{duration} min</strong>
                  </div>
                  <input
                    aria-label="Chaos duration in minutes"
                    type="range"
                    min="5"
                    max="60"
                    value={duration}
                    disabled={controlsLocked}
                    onChange={(event) => setDuration(Number(event.target.value))}
                  />
                  <small>Controlled run window</small>
                </label>
              </div>

              <label className="chaos-secondary-incident">
                <input aria-label="Add second simultaneous incident" type="checkbox" disabled />
                <span>
                  <strong>Add second simultaneous incident</strong>
                  <small>Requires an explicit backend capability before it can be enabled.</small>
                </span>
                <em>Backend gated</em>
              </label>

              <div className="chaos-review-card">
                <div>
                  <p className="eyebrow">Scenario review</p>
                  <strong>
                    {isRandom
                      ? "Blind scenario"
                      : [
                          displayValue("merchant", dimensions.merchant),
                          displayValue("provider", dimensions.provider),
                          displayValue("payment_method", dimensions.payment_method),
                        ].join(" · ")}
                  </strong>
                  <span>
                    {isRandom
                      ? "Dimensions will be selected and sealed by the backend."
                      : [
                          displayValue("country", dimensions.country),
                          displayValue("issuing_bank", dimensions.issuing_bank),
                          displayValue("canonical_decline_code", dimensions.canonical_decline_code),
                        ].join(" · ")}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Degradation</dt>
                    <dd>{severity} pp</dd>
                  </div>
                  <div>
                    <dt>Run window</dt>
                    <dd>{duration} min</dd>
                  </div>
                </dl>
              </div>

              {requestError ? (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-signal-critical/25 bg-signal-critical/[0.08] p-3 text-xs leading-5 text-signal-critical"
                >
                  {requestError}
                </div>
              ) : null}

              {phase === "confirming" ? (
                <div className="chaos-confirm-card">
                  <div>
                    <p className="text-sm font-semibold text-pharos-ink">Confirm this controlled scenario?</p>
                    <p className="mt-1 text-xs leading-5 text-pharos-muted">
                      This calls the PHAROS runtime. It changes only the simulated payment stream and never
                      routes real traffic.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="chaos-secondary-button" onClick={() => setPhase("ready")}>
                      Cancel
                    </button>
                    <button type="button" className="chaos-primary-button" onClick={() => void confirmInjection()}>
                      <Play className="size-3.5" aria-hidden="true" /> Confirm injection
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={controlsLocked}
                  onClick={() => setPhase("confirming")}
                  className="chaos-primary-button mt-5"
                >
                  <Sparkles className="size-3.5" aria-hidden="true" /> Inject scenario
                </button>
              )}
            </div>
          </article>

          <aside className="chaos-run-card xl:sticky xl:top-24">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Run status</p>
                <h2 className="mt-1 text-title font-medium text-pharos-ink">{meta.label}</h2>
              </div>
              {isRunning ? (
                <LoaderCircle className="size-5 text-pharos-accent motion-safe:animate-spin" aria-hidden="true" />
              ) : phase === "revealed" ? (
                <CircleCheck className="size-5 text-signal-healthy" aria-hidden="true" />
              ) : (
                <Gauge className="size-5 text-pharos-faint" aria-hidden="true" />
              )}
            </div>
            <p className="mt-2 text-xs leading-5 text-pharos-muted" role="status">
              {meta.detail}
            </p>

            <div className="chaos-run-summary">
              <div>
                <TimerReset className="size-4 text-pharos-accent" aria-hidden="true" />
                <span>Elapsed time</span>
                <strong>{runSpec ? elapsedLabel(elapsedSeconds) : "00:00"}</strong>
              </div>
              <div>
                <Clock3 className="size-4 text-pharos-accent" aria-hidden="true" />
                <span>Run window</span>
                <strong>{runSpec?.duration_minutes ?? duration} min</strong>
              </div>
            </div>

            {runSpec?.mode === "random_unknown" && !runSpec.revealed ? (
              <div className="chaos-running-blind">
                <LockKeyhole className="size-4" aria-hidden="true" />
                <div>
                  <strong>Blind incident injected</strong>
                  <span>Ground truth remains hidden from the investigator.</span>
                </div>
              </div>
            ) : null}

            <ol className="chaos-run-log">
              <li className={runSpec ? "chaos-log-entry chaos-log-complete" : "chaos-log-entry"}>
                <span>{runSpec ? <Check className="size-3" aria-hidden="true" /> : "1"}</span>
                <div>
                  <p>Scenario accepted</p>
                  <small>{runSpec ? `Runtime id: ${runSpec.chaos_id}` : "Waiting for an API-confirmed request."}</small>
                </div>
              </li>
              <li className={reportsStatus === "live" && reports.length ? "chaos-log-entry chaos-log-active" : "chaos-log-entry"}>
                <span>2</span>
                <div>
                  <p>Investigation reports</p>
                  <small>
                    {reportsStatus === "unavailable"
                      ? "The runtime is unreachable, so no report state can be shown."
                      : reports.length
                        ? `${reports.length} live report${reports.length === 1 ? "" : "s"} currently available.`
                        : "The runtime has not emitted a report yet."}
                  </small>
                </div>
              </li>
              <li className={runSpec?.revealed ? "chaos-log-entry chaos-log-complete" : "chaos-log-entry"}>
                <span>{runSpec?.revealed ? <Check className="size-3" aria-hidden="true" /> : "3"}</span>
                <div>
                  <p>Ground-truth reveal</p>
                  <small>
                    {runSpec?.revealed
                      ? "The runtime returned the injected dimensions."
                      : "Available for blind runs after operator request."}
                  </small>
                </div>
              </li>
            </ol>

            {reports.length ? (
              <Link href="/investigations" className="chaos-incident-link">
                <Link2 className="size-3.5" aria-hidden="true" /> View live investigation queue
              </Link>
            ) : null}

            {runSpec && !runSpec.revealed && runSpec.mode === "random_unknown" ? (
              <button
                type="button"
                className="chaos-primary-button mt-5"
                onClick={() => void requestReveal()}
                disabled={phase === "revealing"}
              >
                <Eye className="size-3.5" aria-hidden="true" /> Reveal ground truth
              </button>
            ) : null}

            {phase !== "ready" && phase !== "confirming" ? (
              <button type="button" onClick={reset} className="chaos-reset-button">
                <RotateCcw className="size-3.5" aria-hidden="true" /> Clear local run view
              </button>
            ) : null}
          </aside>
        </section>

        {runSpec?.revealed ? (
          <section className="chaos-reveal-card">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="eyebrow">Reveal comparison</p>
                <h2 className="mt-1 text-title font-medium text-pharos-ink">
                  Injected truth, returned by the runtime
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-pharos-muted">
                  The current frozen API does not associate an <code>incident_id</code> with a{" "}
                  <code>chaos_id</code>, so PHAROS does not claim an automatic match. Compare this truth with
                  the evidence report in the investigation queue.
                </p>
              </div>
              <span className="chaos-compare-badge chaos-compare-match">
                <Check className="size-3" aria-hidden="true" /> Revealed
              </span>
            </div>

            <div className="mt-6">
              <div className="chaos-compare-header">
                <span>Field</span>
                <span>Ground truth injected</span>
                <span>Runtime state</span>
                <span>Assessment</span>
              </div>
              <div className="chaos-compare-list">
                {dimensionOrder.map((field) => (
                  <div key={field} className="chaos-compare-row">
                    <strong>{dimensionLabel(field)}</strong>
                    <span>{displayValue(field, runSpec.dimensions?.[field])}</span>
                    <span>Available for report review</span>
                    <span className="chaos-compare-badge chaos-compare-partial">
                      <CircleAlert className="size-3" aria-hidden="true" /> Not correlated
                    </span>
                  </div>
                ))}
                <div className="chaos-compare-row">
                  <strong>Severity</strong>
                  <span>{runSpec.severity_pp} pp injected</span>
                  <span>Not exposed by incident detail</span>
                  <span className="chaos-compare-badge chaos-compare-partial">
                    <CircleAlert className="size-3" aria-hidden="true" /> Contract gap
                  </span>
                </div>
                <div className="chaos-compare-row">
                  <strong>Started</strong>
                  <span>
                    {time(runSpec.started_at)} {DISPLAY_TIME_ZONE_LABEL}
                  </span>
                  <span>Reported separately</span>
                  <span className="chaos-compare-badge chaos-compare-partial">
                    <CircleAlert className="size-3" aria-hidden="true" /> Contract gap
                  </span>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
