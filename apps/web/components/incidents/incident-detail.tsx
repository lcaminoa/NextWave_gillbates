"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleAlert,
  FileSearch,
  Landmark,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { candidates, evidence, investigationSteps, reports } from "@/lib/fixtures/control-tower";
import { integer, percent, time, usd } from "@/lib/format";

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  const report = reports.find((item) => item.incident_id === incidentId) ?? reports[0];
  const candidate = candidates.find((item) => item.candidate_id === report.winning_candidate_id);
  const relatedCandidates = candidates.filter((item) => item.anomaly_id === report.anomaly_id);
  const steps = investigationSteps.filter((step) => report.investigation_steps.includes(step.step_id));

  return (
    <div className="control-canvas">
      <main className="mx-auto max-w-[1320px]">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Link href="/" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#b9acbe] hover:text-white">
              <ArrowLeft className="size-3.5" /> Control Tower
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="severity-badge border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fba5b6]">HIGH</span>
              <span className="text-[10px] font-bold tracking-[0.1em] text-[#e4bce4] uppercase">
                {report.status === "inconclusive" ? "Evidence insufficient" : "Probable root cause"}
              </span>
            </div>
            <h1 className="mt-3 max-w-3xl text-[34px] font-medium tracking-[-0.055em] text-[#fbf7fc]">
              {candidate
                ? [candidate.dimensions.provider, candidate.dimensions.country, candidate.dimensions.payment_method, candidate.dimensions.issuing_bank]
                    .filter(Boolean)
                    .join(" × ")
                : "No single cause reached the evidence threshold"}
            </h1>
            <p className="mt-2 text-sm text-[#b7aab9]">
              Detected at 15:48:02 · 31.4 pp approval drop · {usd(report.estimated_revenue_loss_usd)}/hour at risk
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#fbbf24]/25 bg-[#fbbf24]/[0.07] px-3 py-2 text-[11px] font-semibold text-[#f4d27d]">
            <CircleAlert className="size-3.5" /> Human review required
          </span>
        </header>

        <section className="mt-8 grid gap-3 lg:grid-cols-12">
          <article className="control-card p-6 lg:col-span-7">
            <p className="eyebrow">What happened</p>
            <h2 className="mt-2 text-xl font-medium tracking-[-0.035em] text-[#f8f1f9]">{report.summary}</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/[0.08] bg-black/15 p-3">
                <p className="eyebrow">Observed</p>
                <p className="mt-2 text-xl font-semibold text-[#fba7b8]">62.4%</p>
                <p className="mt-1 text-[11px] text-[#a99eaf]">Approval rate</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-black/15 p-3">
                <p className="eyebrow">Expected range</p>
                <p className="mt-2 text-xl font-semibold text-[#e8bfe0]">91.7–95.3%</p>
                <p className="mt-1 text-[11px] text-[#a99eaf]">Credible interval</p>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-black/15 p-3">
                <p className="eyebrow">Affected</p>
                <p className="mt-2 text-xl font-semibold text-[#f3edf4]">{candidate ? integer(candidate.affected_count) : "—"}</p>
                <p className="mt-1 text-[11px] text-[#a99eaf]">Transactions / min</p>
              </div>
            </div>
          </article>

          <article className="control-card p-6 lg:col-span-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Cause path</p>
                <h2 className="mt-2 text-xl font-medium tracking-[-0.035em] text-[#f8f1f9]">Evidence-backed segment</h2>
              </div>
              <Landmark className="size-5 text-[#d9a8dc]" />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {["Global", candidate?.dimensions.country, candidate?.dimensions.provider, candidate?.dimensions.payment_method, candidate?.dimensions.issuing_bank]
                .filter(Boolean)
                .map((item, index, values) => (
                  <div key={item} className="flex items-center gap-2">
                    <span className={index === values.length - 1 ? "rounded-full border border-[#e1a8de]/30 bg-[#d58bd3]/15 px-3 py-1.5 text-xs font-medium text-[#f3cbed]" : "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-[#c4b8c8]"}>
                      {item}
                    </span>
                    {index < values.length - 1 ? <ArrowUpRight className="size-3 text-[#806f86]" /> : null}
                  </div>
                ))}
            </div>
            {candidate?.counterfactual_check ? (
              <div className="mt-5 rounded-xl border border-[#60a5fa]/20 bg-[#60a5fa]/[0.06] p-3">
                <p className="text-[10px] font-bold tracking-[0.1em] text-[#9cc7ff] uppercase">Provider control</p>
                <p className="mt-1.5 text-xs leading-5 text-[#d1deef]">{candidate.counterfactual_check}</p>
              </div>
            ) : null}
          </article>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-12">
          <article className="control-card p-6 lg:col-span-5">
            <p className="eyebrow">Investigation timeline</p>
            <h2 className="mt-2 text-xl font-medium tracking-[-0.035em] text-[#f8f1f9]">What the system checked</h2>
            <ol className="mt-6 space-y-4">
              {steps.map((step, index) => (
                <li key={step.step_id} className="relative flex gap-3">
                  {index < steps.length - 1 ? <span className="absolute left-[7px] top-5 h-9 border-l border-dashed border-white/15" /> : null}
                  <span className={index === steps.length - 1 ? "timeline-dot timeline-dot-live" : "timeline-dot"} />
                  <div>
                    <p className="text-xs font-semibold text-[#eee6f0]">{step.action.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs leading-5 text-[#aaa0ae]">{step.result_summary}</p>
                    <p className="mt-1.5 text-[10px] text-[#857a89]">{time(step.timestamp)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </article>

          <article className="control-card p-6 lg:col-span-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Evidence board</p>
                <h2 className="mt-2 text-xl font-medium tracking-[-0.035em] text-[#f8f1f9]">Claims cite concrete evidence</h2>
              </div>
              <FileSearch className="size-5 text-[#d9a8dc]" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {evidence.filter((item) => candidate?.evidence_ids.includes(item.evidence_id)).map((item) => (
                <article key={item.evidence_id} className="rounded-xl border border-white/[0.08] bg-black/15 p-4">
                  <p className="text-[10px] font-bold tracking-[0.1em] text-[#d9a8dc] uppercase">{item.source.replaceAll("_", " ")}</p>
                  <p className="mt-2 text-xs leading-5 text-[#d7ccd9]">{item.summary}</p>
                  <p className="mt-3 text-[10px] text-[#837888]">ID · {item.evidence_id}</p>
                </article>
              ))}
            </div>
            {report.claims.map((claim) => (
              <div key={claim.claim} className="mt-4 rounded-xl border border-[#e2a9df]/18 bg-[#db9bd7]/[0.05] p-4">
                <p className="text-xs leading-5 text-[#f0e6f1]">{claim.claim}</p>
                <p className="mt-2 text-[10px] text-[#b6a7b9]">
                  Confidence {percent(claim.confidence)} · Evidence {claim.evidence_ids.join(", ")}
                </p>
              </div>
            ))}
          </article>
        </section>

        <section className="mt-3 grid gap-3 lg:grid-cols-12">
          <article className="control-card p-6 lg:col-span-7">
            <p className="eyebrow">Hypotheses evaluated</p>
            <div className="mt-4 space-y-2">
              {relatedCandidates.map((item) => (
                <div key={item.candidate_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/15 p-3">
                  <div>
                    <p className="text-xs font-semibold text-[#f2eaf3]">
                      {[item.dimensions.provider, item.dimensions.country, item.dimensions.payment_method, item.dimensions.issuing_bank].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-[11px] text-[#aaa0af]">{item.counterfactual_check ?? "Not enough discriminating evidence yet."}</p>
                  </div>
                  <span className="text-xs font-semibold text-[#e4b5df]">{percent(item.confidence)}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="control-card relative overflow-hidden p-6 lg:col-span-5">
            <div className="relative z-10">
              <p className="eyebrow">Recommended human action</p>
              <h2 className="mt-2 text-xl font-medium tracking-[-0.035em] text-[#f8f1f9]">Review, do not reroute</h2>
              <p className="mt-3 text-sm leading-6 text-[#d5c9d8]">{report.recommended_action}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#fbbf24]/20 bg-[#fbbf24]/[0.07] px-3 py-1.5 text-[10px] font-semibold text-[#f4d27d]">
                <ShieldCheck className="size-3.5" /> Recommendation only — no traffic was rerouted
              </span>
            </div>
            <Sparkles className="absolute -bottom-6 -right-6 size-32 text-[#d58bd3]/10" />
          </article>
        </section>
      </main>
    </div>
  );
}
