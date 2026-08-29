"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
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
  TriangleAlert,
} from "lucide-react";
import type { ChaosSpec, Dimensions } from "@/lib/contracts";
import { chaosManualFixture, chaosRandomFixture, chaosSystemFindingFixture } from "@/lib/fixtures/chaos";
import { time } from "@/lib/format";

type ChaosPhase =
  | "ready"
  | "confirming"
  | "running"
  | "awaiting-detection"
  | "investigating"
  | "ready-to-reveal"
  | "reveal-pending"
  | "revealed";

type ChaosMode = ChaosSpec["mode"];
type DimensionField = keyof Dimensions;
type ComparisonStatus = "match" | "partial" | "mismatch";

const selectOptions: Record<DimensionField, Array<{ label: string; value: string }>> = {
  merchant: [
    { label: "Marea", value: "Marea" },
    { label: "Tienda Sol", value: "Tienda Sol" },
    { label: "Mercado Norte", value: "Mercado Norte" },
  ],
  provider: [
    { label: "NovaPay", value: "NovaPay" },
    { label: "AuroraPay", value: "AuroraPay" },
    { label: "Orbito", value: "Orbito" },
  ],
  payment_method: [
    { label: "Card", value: "card" },
    { label: "Pix", value: "pix" },
    { label: "Wallet", value: "wallet" },
  ],
  country: [
    { label: "Brazil", value: "BR" },
    { label: "Mexico", value: "MX" },
    { label: "Argentina", value: "AR" },
  ],
  issuing_bank: [
    { label: "Itaú", value: "Itaú" },
    { label: "Banco Azteca", value: "Banco Azteca" },
    { label: "Galicia", value: "Galicia" },
  ],
  canonical_decline_code: [
    { label: "do_not_honor", value: "do_not_honor" },
    { label: "issuer_unavailable", value: "issuer_unavailable" },
    { label: "provider_timeout", value: "provider_timeout" },
  ],
};

const dimensionLabels: Array<{ key: DimensionField; label: string }> = [
  { key: "merchant", label: "Merchant" },
  { key: "provider", label: "Provider" },
  { key: "payment_method", label: "Payment method" },
  { key: "country", label: "Country" },
  { key: "issuing_bank", label: "Issuing bank" },
  { key: "canonical_decline_code", label: "Decline code" },
];

function elapsedLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return minutes + ":" + remainder;
}

function displayValue(value?: string) {
  if (!value) return "Not isolated";
  if (value === "BR") return "Brazil";
  if (value === "MX") return "Mexico";
  if (value === "AR") return "Argentina";
  if (value === "card") return "Card";
  if (value === "pix") return "Pix";
  return value;
}

function compareDimension(truth?: string, finding?: string): ComparisonStatus {
  if (truth === finding) return "match";
  if (!finding) return "partial";
  return "mismatch";
}

function ComparisonBadge({ status }: { status: ComparisonStatus }) {
  if (status === "match") {
    return <span className="chaos-compare-badge chaos-compare-match"><Check className="size-3" /> Match</span>;
  }
  if (status === "partial") {
    return <span className="chaos-compare-badge chaos-compare-partial"><CircleAlert className="size-3" /> Partial</span>;
  }
  return <span className="chaos-compare-badge chaos-compare-mismatch"><TriangleAlert className="size-3" /> Mismatch</span>;
}

export function ChaosConsole() {
  const [mode, setMode] = useState<ChaosMode>("manual");
  const [dimensions, setDimensions] = useState<Dimensions>(chaosManualFixture.dimensions ?? {});
  const [severity, setSeverity] = useState(chaosManualFixture.severity_pp);
  const [duration, setDuration] = useState(chaosManualFixture.duration_minutes ?? 20);
  const [phase, setPhase] = useState<ChaosPhase>("ready");
  const [runSpec, setRunSpec] = useState<ChaosSpec | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const controlsLocked = !["ready", "confirming"].includes(phase);
  const isRandom = mode === "random_unknown";
  const isRunning = ["running", "awaiting-detection", "investigating", "ready-to-reveal"].includes(phase);
  const detectionTimestamp = useMemo(() => {
    if (!runSpec) return null;
    return new Date(new Date(runSpec.started_at).getTime() + 138000).toISOString();
  }, [runSpec]);

  useEffect(() => {
    if (!runSpec || !isRunning) return;
    const interval = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, runSpec]);

  useEffect(() => {
    if (phase === "running") {
      const timeout = window.setTimeout(() => setPhase("awaiting-detection"), 900);
      return () => window.clearTimeout(timeout);
    }
    if (phase === "awaiting-detection") {
      const timeout = window.setTimeout(() => setPhase("investigating"), 950);
      return () => window.clearTimeout(timeout);
    }
    if (phase === "investigating") {
      const timeout = window.setTimeout(() => setPhase("ready-to-reveal"), 1100);
      return () => window.clearTimeout(timeout);
    }
  }, [phase]);

  const updateDimension = (field: DimensionField, value: string) => {
    setDimensions((current) => ({ ...current, [field]: value }));
  };

  const selectMode = (nextMode: ChaosMode) => {
    if (controlsLocked) return;
    setMode(nextMode);
    setPhase("ready");
  };

  const confirmInjection = () => {
    const template = mode === "manual" ? chaosManualFixture : chaosRandomFixture;
    const nextSpec: ChaosSpec = {
      ...template,
      chaos_id: "chaos-" + mode + "-fixture-" + Date.now(),
      mode,
      dimensions: mode === "manual" ? dimensions : undefined,
      severity_pp: severity,
      duration_minutes: duration,
      started_at: new Date().toISOString(),
      revealed: false,
    };
    setRunSpec(nextSpec);
    setElapsedSeconds(0);
    setPhase("running");
  };

  const reset = () => {
    setRunSpec(null);
    setElapsedSeconds(0);
    setPhase("ready");
  };

  const requestReveal = () => {
    if (runSpec?.mode === "manual") {
      setRunSpec({ ...runSpec, revealed: true });
      setPhase("revealed");
      return;
    }
    setPhase("reveal-pending");
  };

  const phaseMeta = {
    ready: { label: "Ready", detail: "Scenario configuration is local.", tone: "neutral" },
    confirming: { label: "Review scenario", detail: "Confirm before the fixture run starts.", tone: "warning" },
    running: { label: "Running", detail: "Scenario accepted by the fixture runner.", tone: "active" },
    "awaiting-detection": { label: "Awaiting detection", detail: "Waiting for sustained deviation.", tone: "active" },
    investigating: { label: "Investigation in progress", detail: "The control room is evaluating evidence.", tone: "active" },
    "ready-to-reveal": { label: "Run complete", detail: "Reveal is now available.", tone: "complete" },
    "reveal-pending": { label: "Reveal requires backend", detail: "Ground truth stays sealed without a backend response.", tone: "warning" },
    revealed: { label: "Revealed", detail: "Fixture comparison is ready for review.", tone: "complete" },
  }[phase];

  const runLog = [
    { phase: "running", title: "Scenario accepted", detail: isRandom ? "Blind scenario sealed outside this UI." : "Manual dimensions accepted for this run." },
    { phase: "awaiting-detection", title: "Awaiting sustained deviation", detail: "No root cause is asserted at injection time." },
    { phase: "investigating", title: "Investigation started", detail: "Control Tower is ready to evaluate the resulting evidence." },
    { phase: "ready-to-reveal", title: "Run window completed", detail: "Reveal can compare injected truth with the system finding." },
  ];
  const phaseOrder: Record<ChaosPhase, number> = {
    ready: 0,
    confirming: 0,
    running: 1,
    "awaiting-detection": 2,
    investigating: 3,
    "ready-to-reveal": 4,
    "reveal-pending": 4,
    revealed: 4,
  };
  const currentOrder = phaseOrder[phase];

  return (
    <div className="control-canvas chaos-canvas">
      <main className="mx-auto w-full max-w-none">
        <header className="chaos-header">
          <div className="relative z-10">
            <Link href="/" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#b9acbe] transition hover:text-white">
              <ArrowLeft className="size-3.5" /> Control Tower
            </Link>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <span className="live-pill"><FlaskConical className="size-3" /> CHAOS LAB</span>
              <span className={"chaos-phase-pill chaos-phase-" + phaseMeta.tone}>{phaseMeta.label}</span>
            </div>
            <h1 className="mt-3 text-[clamp(30px,4vw,45px)] font-medium tracking-[-0.06em] text-[#fbf7fc]">
              Controlled chaos, <span className="text-[#dca6dd]">visible proof.</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#b7aab9]">
              Configure a payment anomaly, watch its investigation state, then compare the injected condition with the system finding.
            </p>
          </div>
          <div className="relative z-10 chaos-header-meta">
            <div>
              <span>Run source</span>
              <strong>Demo fixtures</strong>
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
          <div className="pointer-events-none absolute -right-10 -top-28 size-80 rounded-full bg-[#d193d3]/10 blur-3xl" />
        </header>

        <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.48fr)_minmax(360px,0.82fr)]">
          <article className="chaos-config-card">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
              <div>
                <p className="eyebrow">Scenario configuration</p>
                <h2 className="mt-1 text-[22px] font-medium tracking-[-0.04em] text-[#f8f1f9]">
                  {controlsLocked ? "Scenario locked for this run" : "Define the experiment"}
                </h2>
              </div>
              <div className="chaos-segmented-control" aria-label="Chaos mode">
                <button type="button" onClick={() => selectMode("manual")} disabled={controlsLocked} className={mode === "manual" ? "chaos-segment-active" : ""}>
                  Manual
                </button>
                <button type="button" onClick={() => selectMode("random_unknown")} disabled={controlsLocked} className={mode === "random_unknown" ? "chaos-segment-active" : ""}>
                  Random unknown
                </button>
              </div>
            </div>

            <div className="border-t border-white/[0.08] p-5 md:p-6">
              {mode === "manual" ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {dimensionLabels.map(({ key, label }) => (
                    <label key={key} className="chaos-field">
                      <span>{label}</span>
                      <select
                        aria-label={label}
                        value={dimensions[key] ?? ""}
                        disabled={controlsLocked}
                        onChange={(event) => updateDimension(key, event.target.value)}
                      >
                        {selectOptions[key].map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="chaos-blind-state">
                  <EyeOff className="mt-0.5 size-5 shrink-0 text-[#c4b5fd]" />
                  <div>
                    <p>Blind incident injection</p>
                    <span>Ground truth remains hidden from the investigator and this UI. No dimension is rendered before a backend reveal.</span>
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
                  <small>Requires backend capability before it can be enabled.</small>
                </span>
                <em>Backend gated</em>
              </label>

              <div className="chaos-review-card">
                <div>
                  <p className="eyebrow">Scenario review</p>
                  <strong>{isRandom ? "Blind scenario" : `${displayValue(dimensions.merchant)} · ${displayValue(dimensions.provider)} · ${displayValue(dimensions.payment_method)}`}</strong>
                  <span>
                    {isRandom
                      ? "Dimensions are selected and sealed by the backend."
                      : `${displayValue(dimensions.country)} · ${displayValue(dimensions.issuing_bank)} · ${displayValue(dimensions.canonical_decline_code)}`}
                  </span>
                </div>
                <dl>
                  <div><dt>Degradation</dt><dd>{severity} pp</dd></div>
                  <div><dt>Run window</dt><dd>{duration} min</dd></div>
                </dl>
              </div>

              {phase === "confirming" ? (
                <div className="chaos-confirm-card">
                  <div>
                    <p className="text-sm font-semibold text-[#f5edf7]">Confirm this controlled scenario?</p>
                    <p className="mt-1 text-xs leading-5 text-[#c4b8c8]">This starts a demo fixture run only. It never reroutes or changes payment traffic.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="chaos-secondary-button" onClick={() => setPhase("ready")}>Cancel</button>
                    <button type="button" className="chaos-primary-button" onClick={confirmInjection}><Play className="size-3.5" /> Confirm injection</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={controlsLocked}
                  onClick={() => setPhase("confirming")}
                  className="chaos-primary-button mt-5"
                >
                  <Sparkles className="size-3.5" /> Inject scenario
                </button>
              )}
            </div>
          </article>

          <aside className="chaos-run-card xl:sticky xl:top-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Run status</p>
                <h2 className="mt-1 text-[22px] font-medium tracking-[-0.04em] text-[#f8f1f9]">{phaseMeta.label}</h2>
              </div>
              {isRunning ? <LoaderCircle className="size-5 animate-spin text-[#e2b1df]" /> : phase === "revealed" ? <CircleCheck className="size-5 text-[#7ee2c4]" /> : <Gauge className="size-5 text-[#c5b8cb]" />}
            </div>
            <p className="mt-2 text-xs leading-5 text-[#aaa0af]">{phaseMeta.detail}</p>

            <div className="chaos-run-summary">
              <div>
                <TimerReset className="size-4 text-[#d9a8dc]" />
                <span>Elapsed time</span>
                <strong>{runSpec ? elapsedLabel(elapsedSeconds) : "00:00"}</strong>
              </div>
              <div>
                <Clock3 className="size-4 text-[#d9a8dc]" />
                <span>Run window</span>
                <strong>{runSpec?.duration_minutes ?? duration} min</strong>
              </div>
            </div>

            {runSpec?.mode === "random_unknown" && phase !== "revealed" ? (
              <div className="chaos-running-blind">
                <LockKeyhole className="size-4" />
                <div>
                  <strong>Blind incident injected</strong>
                  <span>Ground truth remains hidden from the investigator.</span>
                </div>
              </div>
            ) : null}

            <ol className="chaos-run-log">
              {runLog.map((entry, index) => {
                const visible = currentOrder >= index + 1;
                const active = currentOrder === index + 1;
                return (
                  <li key={entry.phase} className={visible ? active ? "chaos-log-entry chaos-log-active" : "chaos-log-entry chaos-log-complete" : "chaos-log-entry"}>
                    <span>{visible && !active ? <Check className="size-3" /> : index + 1}</span>
                    <div>
                      <p>{entry.title}</p>
                      <small>{visible ? entry.detail : "Waiting for the previous run state."}</small>
                    </div>
                  </li>
                );
              })}
            </ol>

            {runSpec?.mode === "manual" && ["investigating", "ready-to-reveal", "revealed"].includes(phase) ? (
              <Link href="/incidents/incident-br-novapay" className="chaos-incident-link">
                <Link2 className="size-3.5" /> Open fixture incident
              </Link>
            ) : null}
            {runSpec?.mode === "random_unknown" && ["investigating", "ready-to-reveal"].includes(phase) ? (
              <p className="mt-5 text-[11px] leading-5 text-[#9e93a2]">The incident link is supplied by the live backend when a report exists.</p>
            ) : null}
            {phase !== "ready" && phase !== "confirming" ? (
              <button type="button" onClick={reset} className="chaos-reset-button"><RotateCcw className="size-3.5" /> Reset fixture run</button>
            ) : null}
          </aside>
        </section>

        {["ready-to-reveal", "reveal-pending", "revealed"].includes(phase) ? (
          <section className="chaos-reveal-card">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="eyebrow">Reveal comparison</p>
                <h2 className="mt-1 text-[25px] font-medium tracking-[-0.045em] text-[#f8f1f9]">Injected truth vs. system finding</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#b8adbd]">Each field is evaluated independently. A partial result is never presented as a global match.</p>
              </div>
              {phase === "ready-to-reveal" ? (
                <button type="button" className="chaos-primary-button" onClick={requestReveal}>
                  <Eye className="size-3.5" /> Reveal ground truth
                </button>
              ) : null}
            </div>

            {phase === "reveal-pending" ? (
              <div className="chaos-reveal-sealed">
                <LockKeyhole className="size-5 text-[#c4b5fd]" />
                <div>
                  <p>Ground truth remains sealed.</p>
                  <span>POST /api/chaos/reveal is prepared in the adapter, but this local fixture does not contain hidden random dimensions. Connect the backend to reveal and compare them safely.</span>
                </div>
              </div>
            ) : null}

            {phase === "revealed" && runSpec?.dimensions ? (
              <div className="mt-6">
                <div className="chaos-compare-header">
                  <span>Field</span>
                  <span>Ground truth injected</span>
                  <span>System finding</span>
                  <span>Assessment</span>
                </div>
                <div className="chaos-compare-list">
                  {dimensionLabels.map(({ key, label }) => {
                    const status = compareDimension(runSpec.dimensions?.[key], chaosSystemFindingFixture[key]);
                    return (
                      <div key={key} className="chaos-compare-row">
                        <strong>{label}</strong>
                        <span>{displayValue(runSpec.dimensions?.[key])}</span>
                        <span>{displayValue(chaosSystemFindingFixture[key])}</span>
                        <ComparisonBadge status={status} />
                      </div>
                    );
                  })}
                  <div className="chaos-compare-row">
                    <strong>Severity</strong>
                    <span>{runSpec.severity_pp} pp injected</span>
                    <span>−31.4 pp observed</span>
                    <ComparisonBadge status="partial" />
                  </div>
                  <div className="chaos-compare-row">
                    <strong>Timing</strong>
                    <span>{time(runSpec.started_at)}</span>
                    <span>{detectionTimestamp ? time(detectionTimestamp) : "Not detected"}</span>
                    <ComparisonBadge status="partial" />
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
