"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CircleAlert,
  FileSearch,
  Landmark,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { anomalies, baseline, candidates, evidence, investigationSteps, reports } from "@/lib/fixtures/control-tower";
import { deltaPp, percent, time, usd } from "@/lib/format";
import type { Anomaly, IncidentCandidate, Severity } from "@/lib/contracts";

type EvidenceBlock = {
  key: string;
  title: string;
  source: string;
  emptyCopy: string;
};

const evidenceBlocks: EvidenceBlock[] = [
  {
    key: "baseline_comparison",
    title: "Baseline comparison",
    source: "baseline_comparison",
    emptyCopy: "No baseline comparison is cited for this incident yet.",
  },
  {
    key: "counterfactual_provider",
    title: "Provider control",
    source: "counterfactual_provider",
    emptyCopy: "No provider control has produced citable evidence yet.",
  },
  {
    key: "decline_code_distribution",
    title: "Decline-code shift",
    source: "decline_code_distribution",
    emptyCopy: "No decline-code shift has been established for this incident yet.",
  },
];

const severityClass: Record<Severity, string> = {
  low: "border-[#60a5fa]/30 bg-[#60a5fa]/10 text-[#93c5fd]",
  medium: "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fcd66d]",
  high: "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fda4b4]",
  critical: "border-[#fb7185]/40 bg-[#fb7185]/15 text-[#fecdd3]",
};

function candidateLabel(candidate?: IncidentCandidate) {
  if (!candidate) return "No single cause meets the evidence threshold";
  return [
    candidate.dimensions.provider,
    candidate.dimensions.country,
    candidate.dimensions.payment_method,
    candidate.dimensions.issuing_bank,
  ]
    .filter(Boolean)
    .join(" × ");
}

function chartPath(values: number[], x: (index: number) => number, y: (value: number) => number) {
  return values
    .map((value, index) => (index === 0 ? "M" : "L") + x(index).toFixed(2) + "," + y(value).toFixed(2))
    .join(" ");
}

function IncidentPerformanceChart({ anomaly }: { anomaly: Anomaly }) {
  const width = 760;
  const height = 268;
  const inset = { top: 22, right: 26, bottom: 36, left: 44 };
  const innerWidth = width - inset.left - inset.right;
  const innerHeight = height - inset.top - inset.bottom;
  const lower = Math.max(0, anomaly.expected_approval_rate + (baseline.credible_interval[0] - baseline.expected_approval_rate));
  const upper = Math.min(1, anomaly.expected_approval_rate + (baseline.credible_interval[1] - baseline.expected_approval_rate));
  const recovery = Math.min(anomaly.expected_approval_rate, anomaly.observed_approval_rate + 0.052);
  const onset = Math.min(anomaly.expected_approval_rate, anomaly.observed_approval_rate + 0.18);
  const points = [
    anomaly.expected_approval_rate + 0.002,
    anomaly.expected_approval_rate - 0.004,
    anomaly.expected_approval_rate + 0.001,
    anomaly.expected_approval_rate - 0.003,
    anomaly.expected_approval_rate,
    anomaly.expected_approval_rate - 0.008,
    onset,
    anomaly.observed_approval_rate,
    recovery,
  ];
  const minValue = Math.max(0, Math.min(anomaly.observed_approval_rate - 0.05, lower - 0.04));
  const maxValue = Math.min(1, upper + 0.04);
  const x = (index: number) => inset.left + (index / (points.length - 1)) * innerWidth;
  const y = (value: number) => inset.top + ((maxValue - value) / (maxValue - minValue)) * innerHeight;
  const observedPath = chartPath(points, x, y);
  const bandTop = chartPath(points.map(() => upper), x, y);
  const bandBottom = chartPath([...points].reverse().map(() => lower), (index) => x(points.length - 1 - index), y);
  const tickValues = [lower, (lower + upper) / 2, upper];
  const onsetIndex = 6;
  const lastIndex = points.length - 1;

  return (
    <div className="incident-chart mt-5">
      <svg
        viewBox={"0 0 " + width + " " + height}
        className="h-[246px] w-full"
        role="img"
        aria-label="Observed approval rate against the expected credible range for the incident window."
      >
        <defs>
          <linearGradient id="incidentExpectedBand" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#d9a9df" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#d9a9df" stopOpacity="0.025" />
          </linearGradient>
          <linearGradient id="incidentObservedFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f0b5dc" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#f0b5dc" stopOpacity="0" />
          </linearGradient>
        </defs>
        {tickValues.map((tick) => (
          <g key={tick}>
            <line
              x1={inset.left}
              x2={width - inset.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgba(235, 224, 241, 0.10)"
              strokeDasharray="3 5"
            />
            <text x={inset.left - 10} y={y(tick) + 4} textAnchor="end" fill="#968b9b" fontSize="10">
              {percent(tick, 0)}
            </text>
          </g>
        ))}
        <path d={bandTop + " " + bandBottom + " Z"} fill="url(#incidentExpectedBand)" />
        <path d={bandTop} fill="none" stroke="#d7b5dc" strokeDasharray="4 5" strokeOpacity="0.72" />
        <path
          d={
            observedPath +
            " L" +
            x(lastIndex).toFixed(2) +
            "," +
            y(minValue).toFixed(2) +
            " L" +
            x(0).toFixed(2) +
            "," +
            y(minValue).toFixed(2) +
            " Z"
          }
          fill="url(#incidentObservedFill)"
        />
        <line
          x1={x(onsetIndex)}
          x2={x(onsetIndex)}
          y1={inset.top}
          y2={height - inset.bottom}
          stroke="#fb7185"
          strokeDasharray="3 5"
          strokeOpacity="0.65"
        />
        <path d={observedPath} fill="none" stroke="#efbfdc" strokeWidth="2.3" />
        {points.map((point, index) => (
          <circle
            key={index}
            cx={x(index)}
            cy={y(point)}
            r={index >= onsetIndex ? 3.4 : 2.2}
            fill={index >= onsetIndex ? "#fb7185" : "#e9c0e3"}
            stroke="#1c1320"
            strokeWidth="1.6"
          />
        ))}
        <g transform={"translate(" + Math.min(x(lastIndex) - 148, width - 174) + " " + Math.max(y(anomaly.observed_approval_rate) - 66, 18) + ")"}>
          <rect width="158" height="57" rx="9" fill="#1b131f" stroke="rgba(240,213,239,0.18)" />
          <text x="11" y="18" fill="#f8eff9" fontSize="10" fontWeight="700">
            Observed {percent(anomaly.observed_approval_rate)}
          </text>
          <text x="11" y="36" fill="#e9b4d8" fontSize="10">
            Expected {percent(lower)}–{percent(upper)}
          </text>
          <text x="11" y="50" fill="#9c90a0" fontSize="9">
            {anomaly.persistence_windows} sustained windows
          </text>
        </g>
        {["T−20m", "T−15m", "T−10m", "T−5m", "Now"].map((label, index) => (
          <text key={label} x={x(index * 2)} y={height - 12} textAnchor="middle" fill="#938895" fontSize="10">
            {label}
          </text>
        ))}
      </svg>
      <div className="incident-chart-legend">
        <span><i className="bg-[#efbfdc]" /> Observed approval</span>
        <span><i className="border-t border-dashed border-[#d7b5dc]" /> Expected credible range</span>
        <span><i className="border-l border-dashed border-[#fb7185]" /> Signal sustained</span>
      </div>
    </div>
  );
}

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  const report = reports.find((item) => item.incident_id === incidentId) ?? reports[0];
  const anomaly = anomalies.find((item) => item.anomaly_id === report.anomaly_id) ?? anomalies[0];
  const relatedCandidates = candidates
    .filter((item) => item.anomaly_id === report.anomaly_id)
    .sort((left, right) => right.confidence - left.confidence);
  const winningCandidate = candidates.find((item) => item.candidate_id === report.winning_candidate_id);
  const leadCandidate = winningCandidate ?? relatedCandidates[0];
  const steps = investigationSteps.filter((step) => report.investigation_steps.includes(step.step_id));
  const claimEvidenceIds = new Set(report.claims.flatMap((claim) => claim.evidence_ids));
  const citedEvidence = evidence.filter((item) => claimEvidenceIds.has(item.evidence_id));
  const isInconclusive = report.status === "inconclusive";
  const causePath = [
    "Global",
    leadCandidate?.dimensions.country,
    leadCandidate?.dimensions.payment_method,
    leadCandidate?.dimensions.provider,
    leadCandidate?.dimensions.issuing_bank,
  ].filter(Boolean);

  const hypothesisTone = (item: IncidentCandidate, index: number) => {
    if (item.candidate_id === report.winning_candidate_id) return "supported";
    if (isInconclusive && index === 0) return "close";
    return index === 1 ? "less-evidence" : "insufficient";
  };

  const hypothesisCopy = (tone: string) => {
    if (tone === "supported") return "Supported by cited evidence";
    if (tone === "close") return "Evidence remains close";
    if (tone === "less-evidence") return "Less discriminating evidence";
    return "Insufficient evidence";
  };

  return (
    <div className="control-canvas incident-canvas">
      <main className="mx-auto w-full max-w-none">
        <header className="incident-hero">
          <div className="relative z-10">
            <nav className="flex items-center gap-2 text-[11px] font-medium text-[#9f92a4]" aria-label="Investigation breadcrumb">
              <Link href="/investigations" className="transition hover:text-white">Investigations</Link>
              <span aria-hidden="true">/</span>
              <span className="text-[#d6c8da]">{report.incident_id}</span>
            </nav>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <span className={"severity-badge " + severityClass[anomaly.severity]}>{anomaly.severity}</span>
              <span className={isInconclusive ? "incident-status incident-status-inconclusive" : "incident-status"}>
                {isInconclusive ? "Evidence insufficient" : report.status === "confirmed" ? "Confirmed cause" : "Probable cause"}
              </span>
            </div>
            <h1 className="mt-3 max-w-4xl text-[clamp(30px,4vw,47px)] font-medium leading-[1.02] tracking-[-0.065em] text-[#fbf7fc]">
              {isInconclusive ? "No single cause meets the evidence threshold." : candidateLabel(leadCandidate)}
            </h1>
            <p className="mt-3 max-w-3xl text-[15px] leading-6 text-[#bdb0c1]">{report.summary}</p>
          </div>

          <div className="relative z-10 mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
            <div className="incident-hero-stat">
              <p>Detected</p>
              <strong>{time(anomaly.detected_at).slice(0, 5)} BRT</strong>
              <span>{anomaly.persistence_windows} sustained windows</span>
            </div>
            <div className="incident-hero-stat">
              <p>Approval delta</p>
              <strong className="text-[#fca5b5]">{deltaPp(anomaly.observed_approval_rate, anomaly.expected_approval_rate)}</strong>
              <span>{percent(anomaly.observed_approval_rate)} observed</span>
            </div>
            <div className="incident-hero-stat">
              <p>Revenue at risk</p>
              <strong>{usd(report.estimated_revenue_loss_usd)}/hr</strong>
              <span>Recommendation only</span>
            </div>
            <div className="incident-hero-stat incident-hero-review">
              <p>Decision gate</p>
              <strong className="flex items-center gap-1.5"><CircleAlert className="size-4" /> Human review required</strong>
              <span>No payment traffic changed</span>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-12 -top-32 size-80 rounded-full bg-[#ce8cd5]/10 blur-3xl" />
        </header>

        <section className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.95fr)_minmax(300px,0.95fr)]">
          <div className="min-w-0 space-y-4">
            <article className="incident-workspace-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Approval performance</p>
                  <h2 className="mt-1 text-[23px] font-medium tracking-[-0.045em] text-[#f8f1f9]">Observed vs. expected range</h2>
                  <p className="mt-1 text-xs text-[#aaa0af]">The incident persisted beyond the expected approval interval.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-semibold text-[#cbbdd0]">
                  Incident window
                </span>
              </div>
              <IncidentPerformanceChart anomaly={anomaly} />
            </article>

            <article className="incident-workspace-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Cause path</p>
                  <h2 className="mt-1 text-[21px] font-medium tracking-[-0.04em] text-[#f8f1f9]">
                    {isInconclusive ? "Investigation scope, not a root cause" : "Most-supported segment"}
                  </h2>
                </div>
                <Landmark className="size-5 text-[#d9a8dc]" />
              </div>
              <div className="incident-cause-path mt-5">
                {causePath.map((item, index) => (
                  <div key={item as string} className="flex items-center gap-2">
                    <span className={index === causePath.length - 1 && !isInconclusive ? "incident-cause-node incident-cause-node-strong" : "incident-cause-node"}>
                      {item}
                    </span>
                    {index < causePath.length - 1 ? <ArrowUpRight className="size-3 text-[#756a79]" /> : null}
                  </div>
                ))}
              </div>
              <p className="mt-5 max-w-3xl text-sm leading-6 text-[#c6bac9]">
                {isInconclusive
                  ? "The location and payment cohort are known, but the current evidence does not isolate a provider, issuer, or broader country effect."
                  : leadCandidate?.counterfactual_check}
              </p>
            </article>

            <article className="incident-workspace-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Evidence board</p>
                  <h2 className="mt-1 text-[23px] font-medium tracking-[-0.045em] text-[#f8f1f9]">What supports the investigation</h2>
                </div>
                <FileSearch className="size-5 text-[#d9a8dc]" />
              </div>
              <div className="mt-5 divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/[0.12]">
                {evidenceBlocks.map((block, index) => {
                  const item = citedEvidence.find((entry) => entry.source === block.source);
                  return (
                    <section key={block.key} className="incident-evidence-row">
                      <div className="incident-evidence-index">0{index + 1}</div>
                      <div>
                        <p className="text-[13px] font-semibold text-[#f5edf7]">{block.title}</p>
                        <p className={item ? "mt-1.5 text-sm leading-6 text-[#cdc1d0]" : "mt-1.5 text-sm leading-6 text-[#918592]"}>
                          {item?.summary ?? block.emptyCopy}
                        </p>
                      </div>
                      <div className="self-start text-right">
                        {item ? (
                          <>
                            <span className="text-[10px] font-semibold tracking-[0.1em] text-[#d8a8d9] uppercase">Cited</span>
                            <p className="mt-1 text-[10px] text-[#8e8391]">{item.evidence_id}</p>
                          </>
                        ) : (
                          <span className="text-[10px] font-semibold tracking-[0.1em] text-[#847985] uppercase">Not established</span>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
              {report.claims.map((claim) => (
                <div key={claim.claim} className="incident-claim">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-[#e2b1df]" />
                  <div>
                    <p className="text-sm leading-6 text-[#f0e6f1]">{claim.claim}</p>
                    <p className="mt-1 text-[10px] text-[#aa9cab]">
                      {percent(claim.confidence)} confidence · Evidence: {claim.evidence_ids.join(", ")}
                    </p>
                  </div>
                </div>
              ))}
            </article>

            <article className="incident-workspace-card p-5 md:p-6">
              <p className="eyebrow">Hypotheses</p>
              <h2 className="mt-1 text-[22px] font-medium tracking-[-0.04em] text-[#f8f1f9]">
                {isInconclusive ? "Close explanations, no asserted cause" : "One lead, two alternatives"}
              </h2>
              <div className="mt-5 space-y-2">
                {relatedCandidates.slice(0, 3).map((item, index) => {
                  const tone = hypothesisTone(item, index);
                  return (
                    <div key={item.candidate_id} className={"incident-hypothesis incident-hypothesis-" + tone}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold tracking-[0.1em] uppercase">{hypothesisCopy(tone)}</span>
                          <span className="text-[10px] text-[#958a99]">{percent(item.confidence)} confidence</span>
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-[#f3ebf4]">{candidateLabel(item)}</p>
                        <p className="mt-1 text-[12px] leading-5 text-[#afa4b2]">{item.counterfactual_check ?? "No discriminating evidence is available yet."}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="incident-recommendation">
              <div className="relative z-10">
                <p className="eyebrow">Recommended human action</p>
                <h2 className="mt-1 text-[23px] font-medium tracking-[-0.045em] text-[#fbf5fb]">
                  {isInconclusive ? "Review the competing explanations before any change." : "Validate the provider response with human review."}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#ddd1df]">{report.recommended_action}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#fbbf24]/20 bg-[#fbbf24]/[0.07] px-3 py-1.5 text-[10px] font-semibold text-[#f4d27d]">
                  <ShieldCheck className="size-3.5" /> Recommendation only — no traffic was rerouted
                </span>
              </div>
              <div className="pointer-events-none absolute -bottom-12 -right-12 size-44 rounded-full bg-[#e2a7da]/12 blur-3xl" />
            </article>
          </div>

          <aside className="incident-timeline-card lg:sticky lg:top-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Live investigation</p>
                <h2 className="mt-1 text-[20px] font-medium tracking-[-0.04em] text-[#f8f1f9]">The incident story</h2>
              </div>
              <span className="live-pill">LIVE</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#aaa0af]">Only material detection and investigation events are shown.</p>
            <ol className="mt-6">
              <li className="incident-timeline-entry incident-timeline-entry-alert">
                <span className="incident-timeline-dot" />
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.09em] text-[#fba5b6] uppercase">Anomaly detected</p>
                  <p className="mt-1 text-sm font-medium text-[#f1e7f1]">{deltaPp(anomaly.observed_approval_rate, anomaly.expected_approval_rate)} outside expected approval</p>
                  <p className="mt-1 text-[11px] leading-5 text-[#aaa0af]">{anomaly.persistence_windows} consecutive windows confirmed a sustained deviation.</p>
                  <time className="mt-2 block text-[10px] text-[#847987]">{time(anomaly.detected_at)}</time>
                </div>
              </li>
              {steps.map((step, index) => (
                <li key={step.step_id} className="incident-timeline-entry">
                  <span className={index === steps.length - 1 ? "incident-timeline-dot incident-timeline-dot-live" : "incident-timeline-dot"} />
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.09em] text-[#d8c1dc] uppercase">{step.action.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-sm leading-5 text-[#ece3ed]">{step.result_summary}</p>
                    <time className="mt-2 block text-[10px] text-[#847987]">{time(step.timestamp)}</time>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 border-t border-white/[0.08] pt-4">
              <p className="text-[11px] leading-5 text-[#a89dab]">Timeline entries are sourced from the anomaly and recorded InvestigationStep fixtures.</p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
