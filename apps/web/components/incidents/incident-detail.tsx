"use client";

import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, FileSearch, Landmark, Minus, ShieldCheck, Sparkles, X } from "lucide-react";
import { useIncidentDetail } from "@/lib/api/use-control-tower";
import { percent, time, usd } from "@/lib/format";
import type { IncidentCandidate } from "@/lib/contracts";

function candidateLabel(candidate?: IncidentCandidate) {
  if (!candidate) return "No single cause meets the evidence threshold";
  return [
    candidate.dimensions.merchant,
    candidate.dimensions.country,
    candidate.dimensions.payment_method,
    candidate.dimensions.provider,
    candidate.dimensions.issuing_bank,
  ].filter(Boolean).join(" × ");
}

function LoadState({ message }: { message: string }) {
  return (
    <div className="control-canvas incident-canvas">
      <main className="mx-auto w-full max-w-none">
        <section className="incident-workspace-card p-6 text-sm leading-6 text-[#d7c9da]">{message}</section>
      </main>
    </div>
  );
}

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  const { detail, status, error } = useIncidentDetail(incidentId);
  if (status === "loading") return <LoadState message="Loading the live incident workspace…" />;
  if (!detail) return <LoadState message={`The PHAROS runtime could not load this incident. ${error ?? ""}`} />;

  const { report, candidates, evidence, investigation_steps: steps } = detail;
  const relatedCandidates = [...candidates].sort((left, right) => right.confidence - left.confidence);
  const winningCandidate = relatedCandidates.find((item) => item.candidate_id === report.winning_candidate_id);
  const leadCandidate = winningCandidate ?? relatedCandidates[0];
  const citedEvidenceIds = new Set(report.claims.flatMap((claim) => claim.evidence_ids));
  const citedEvidence = evidence.filter((item) => citedEvidenceIds.has(item.evidence_id));
  const isInconclusive = report.status === "inconclusive";
  const causePath = ["Global", leadCandidate?.dimensions.country, leadCandidate?.dimensions.payment_method, leadCandidate?.dimensions.provider, leadCandidate?.dimensions.issuing_bank].filter(Boolean);
  const audit = detail.evidence_audit;
  const visibleAuditChecks = audit.status === "approved" ? audit.checks.filter((check) => check.status === "pass") : audit.checks;
  const auditTitle = audit.status === "approved"
    ? isInconclusive ? "Verified safe abstention" : "PHAROS VERIFIED"
    : audit.status === "rejected"
      ? "REPORT WITHHELD"
      : audit.status === "error"
        ? "SAFE PUBLICATION FAILURE"
        : "Independent audit not run";

  return (
    <div className="control-canvas incident-canvas">
      <main className="mx-auto w-full max-w-none">
        <header className="incident-hero">
          <div className="relative z-10">
            <nav className="flex items-center gap-2 text-[11px] font-medium text-[#9f92a4]" aria-label="Investigation breadcrumb">
              <Link href="/investigations" className="transition hover:text-white">Investigations</Link><span aria-hidden="true">/</span><span className="text-[#d6c8da]">{report.incident_id}</span>
            </nav>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              <span className="severity-badge border-[#dca6dd]/30 bg-[#dca6dd]/10 text-[#efc4ef]">LIVE REPORT</span>
              <span className={isInconclusive ? "incident-status incident-status-inconclusive" : "incident-status"}>{isInconclusive ? "Evidence insufficient" : report.status === "confirmed" ? "Confirmed cause" : "Probable cause"}</span>
            </div>
            <h1 className="mt-3 max-w-4xl text-[clamp(30px,4vw,47px)] font-medium leading-[1.02] tracking-[-0.065em] text-[#fbf7fc]">{isInconclusive ? "No single cause meets the evidence threshold." : candidateLabel(leadCandidate)}</h1>
            <p className="mt-3 max-w-3xl text-[15px] leading-6 text-[#bdb0c1]">{report.summary}</p>
          </div>
          <div className="relative z-10 mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
            <div className="incident-hero-stat"><p>Report generated</p><strong>{time(report.generated_at)}</strong><span>Runtime timestamp</span></div>
            <div className="incident-hero-stat"><p>Evidence cited</p><strong>{citedEvidence.length}</strong><span>{report.claims.length} reported claims</span></div>
            <div className="incident-hero-stat"><p>Revenue at risk</p><strong>{usd(report.estimated_revenue_loss_usd_per_hour)}/hr</strong><span>Recommendation only</span></div>
            <div className="incident-hero-stat incident-hero-review"><p>Decision gate</p><strong className="flex items-center gap-1.5"><CircleAlert className="size-4" /> {report.requires_human_review ? "Human review required" : "Operator review"}</strong><span>No payment traffic changed</span></div>
          </div>
          <div className="pointer-events-none absolute -right-12 -top-32 size-80 rounded-full bg-[#ce8cd5]/10 blur-3xl" />
        </header>

        <section className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.95fr)_minmax(300px,0.95fr)]">
          <div className="min-w-0 space-y-4">
            <article className="incident-workspace-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Signal availability</p><h2 className="mt-1 text-[23px] font-medium tracking-[-0.045em] text-[#f8f1f9]">Evidence, without invented telemetry</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#aaa0af]">The current incident API returns candidates, evidence and investigation steps. It does not expose the anomaly or baseline series yet, so this workspace intentionally does not display a fabricated approval chart or severity.</p></div><FileSearch className="size-5 text-[#d9a8dc]" /></div>
            </article>

            <article className="incident-workspace-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Cause path</p><h2 className="mt-1 text-[21px] font-medium tracking-[-0.04em] text-[#f8f1f9]">{isInconclusive ? "Investigation scope, not a root cause" : "Most-supported segment"}</h2></div><Landmark className="size-5 text-[#d9a8dc]" /></div>
              <div className="incident-cause-path mt-5">{causePath.map((item, index) => <div key={item as string} className="flex items-center gap-2"><span className={index === causePath.length - 1 && !isInconclusive ? "incident-cause-node incident-cause-node-strong" : "incident-cause-node"}>{item}</span>{index < causePath.length - 1 ? <ArrowUpRight className="size-3 text-[#756a79]" /> : null}</div>)}</div>
              <p className="mt-5 max-w-3xl text-sm leading-6 text-[#c6bac9]">{leadCandidate?.counterfactual_check ?? "No discriminating counterfactual evidence is available yet."}</p>
            </article>

            <article className="incident-workspace-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Evidence board</p><h2 className="mt-1 text-[23px] font-medium tracking-[-0.045em] text-[#f8f1f9]">What supports the investigation</h2></div><FileSearch className="size-5 text-[#d9a8dc]" /></div>
              <div className="mt-5 divide-y divide-white/[0.08] overflow-hidden rounded-2xl border border-white/[0.08] bg-black/[0.12]">
                {citedEvidence.length ? citedEvidence.map((item, index) => <section key={item.evidence_id} className="incident-evidence-row"><div className="incident-evidence-index">{String(index + 1).padStart(2, "0")}</div><div><p className="text-[13px] font-semibold text-[#f5edf7]">{item.source.replaceAll("_", " ")}</p><p className="mt-1.5 text-sm leading-6 text-[#cdc1d0]">{item.summary}</p></div><div className="self-start text-right"><span className="text-[10px] font-semibold tracking-[0.1em] text-[#d8a8d9] uppercase">Cited</span><p className="mt-1 text-[10px] text-[#8e8391]">{item.evidence_id}</p></div></section>) : <p className="p-5 text-sm text-[#918592]">No citable evidence has been returned for this report.</p>}
              </div>
              {report.claims.map((claim) => <div key={claim.claim} className="incident-claim"><Sparkles className="mt-0.5 size-4 shrink-0 text-[#e2b1df]" /><div><p className="text-sm leading-6 text-[#f0e6f1]">{claim.claim}</p><p className="mt-1 text-[10px] text-[#aa9cab]">{percent(claim.confidence)} confidence · Evidence: {claim.evidence_ids.join(", ") || "not cited"}</p></div></div>)}
            </article>

            <details className={`incident-audit-seal incident-audit-${audit.status}`} open={audit.status === "rejected" || audit.status === "error"}>
              <summary>
                <div className="flex min-w-0 items-start gap-3">
                  <span className="incident-audit-icon"><ShieldCheck className="size-5" /></span>
                  <div className="min-w-0"><p className="eyebrow">Evidence Audit Seal</p><h2>{auditTitle}</h2><p>{audit.summary}</p></div>
                </div>
                <span className="incident-audit-expand">Open audit</span>
              </summary>
              <div className="incident-audit-body">
                <div className="incident-audit-stats"><div><span>Claims reviewed</span><strong>{audit.claims_reviewed}</strong></div><div><span>Evidence reviewed</span><strong>{audit.evidence_reviewed}</strong></div><div><span>Publication state</span><strong>{audit.status.replaceAll("_", " ")}</strong></div></div>
                <div className="incident-audit-checks">{visibleAuditChecks.map((check) => <div key={check.code} className={`incident-audit-check incident-audit-check-${check.status}`}><span>{check.status === "pass" ? <Check className="size-3.5" /> : check.status === "fail" ? <X className="size-3.5" /> : <Minus className="size-3.5" />}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></div>)}</div>
                {audit.issues.length ? <div className="incident-audit-issues"><p className="eyebrow">Why publication was withheld</p>{audit.issues.map((issue, index) => <div key={`${issue.code}-${index}`}><CircleAlert className="mt-0.5 size-4 shrink-0" /><p><strong>{issue.code.replaceAll("_", " ")}</strong>{issue.message}{issue.evidence_ids.length ? <span>Evidence: {issue.evidence_ids.join(", ")}</span> : null}</p></div>)}</div> : null}
                <div className="incident-audit-safety"><span><CircleAlert className="size-3.5" /> Human review required</span><span><ShieldCheck className="size-3.5" /> No action executed</span></div>
              </div>
            </details>

            <article className="incident-workspace-card p-5 md:p-6"><p className="eyebrow">Hypotheses</p><h2 className="mt-1 text-[22px] font-medium tracking-[-0.04em] text-[#f8f1f9]">{isInconclusive ? "Close explanations, no asserted cause" : "Ranked investigation candidates"}</h2><div className="mt-5 space-y-2">{relatedCandidates.map((item) => <div key={item.candidate_id} className={item.candidate_id === report.winning_candidate_id ? "incident-hypothesis incident-hypothesis-supported" : "incident-hypothesis incident-hypothesis-less-evidence"}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold tracking-[0.1em] uppercase">{item.candidate_id === report.winning_candidate_id ? "Supported by cited evidence" : "Alternative explanation"}</span><span className="text-[10px] text-[#958a99]">{percent(item.confidence)} confidence</span></div><p className="mt-1.5 text-sm font-semibold text-[#f3ebf4]">{candidateLabel(item)}</p><p className="mt-1 text-[12px] leading-5 text-[#afa4b2]">{item.counterfactual_check ?? "No discriminating evidence is available yet."}</p></div></div>)}</div></article>

            <article className="incident-recommendation"><div className="relative z-10"><p className="eyebrow">Recommended human action</p><h2 className="mt-1 text-[23px] font-medium tracking-[-0.045em] text-[#fbf5fb]">Review before any external change.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[#ddd1df]">{report.recommended_action}</p><span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#fbbf24]/20 bg-[#fbbf24]/[0.07] px-3 py-1.5 text-[10px] font-semibold text-[#f4d27d]"><ShieldCheck className="size-3.5" /> Recommendation only — no traffic was rerouted</span></div><div className="pointer-events-none absolute -bottom-12 -right-12 size-44 rounded-full bg-[#e2a7da]/12 blur-3xl" /></article>
          </div>

          <aside className="incident-timeline-card lg:sticky lg:top-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Live investigation</p><h2 className="mt-1 text-[20px] font-medium tracking-[-0.04em] text-[#f8f1f9]">The incident story</h2></div><span className={status === "live" ? "live-pill" : "live-pill opacity-60"}>{status === "live" ? "LIVE" : "STALE"}</span></div><p className="mt-3 text-xs leading-5 text-[#aaa0af]">Only recorded investigation steps are displayed.</p><ol className="mt-6">{steps.length ? steps.map((step, index) => <li key={step.step_id} className="incident-timeline-entry"><span className={index === steps.length - 1 ? "incident-timeline-dot incident-timeline-dot-live" : "incident-timeline-dot"} /><div><p className="text-[10px] font-semibold tracking-[0.09em] text-[#d8c1dc] uppercase">{step.action.replaceAll("_", " ")}</p><p className="mt-1 text-sm leading-5 text-[#ece3ed]">{step.result_summary}</p><time className="mt-2 block text-[10px] text-[#847987]">{time(step.timestamp)}</time></div></li>) : <li className="text-sm text-[#aaa0af]">No investigation step has been recorded.</li>}</ol><div className="mt-6 border-t border-white/[0.08] pt-4"><p className="text-[11px] leading-5 text-[#a89dab]">Timeline entries come directly from the runtime.</p></div></aside>
        </section>
      </main>
    </div>
  );
}
