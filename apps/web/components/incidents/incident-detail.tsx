"use client";

import Link from "next/link";
import { ChevronRight, FileSearch, Landmark, ShieldCheck, Sparkles } from "lucide-react";
import { statusFromErrorMessage } from "@/lib/api/control-tower";
import { useIncidentDetail } from "@/lib/api/use-control-tower";
import { describeDimensions, dimensionValueLabel, segmentLabel, actionLabel } from "@/lib/dimensions";
import { approvalDeltaPp, DISPLAY_TIME_ZONE_LABEL, integer, percent, time, usd } from "@/lib/format";
import type { Evidence, IncidentCandidate } from "@/lib/contracts";
import { HumanReviewChip, ReportStatusBadge, RuntimeIndicator } from "@/components/ui/status";
import { LoadingState, NotFoundState, RuntimeUnavailableState } from "@/components/ui/states";

/** Human grouping for the evidence board. Unknown sources keep their own group. */
const evidenceGroupLabels: Record<string, string> = {
  baseline_comparison: "Baseline",
  counterfactual_provider: "Provider control",
  counterfactual_issuer: "Issuer control",
  decline_code_distribution: "Decline-code mix",
  traffic_mix: "Traffic mix",
};

function groupEvidence(evidence: Evidence[]) {
  const groups = new Map<string, Evidence[]>();
  for (const item of evidence) {
    const label = evidenceGroupLabels[item.source] ?? actionLabel(item.source);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return [...groups.entries()];
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="control-canvas incident-canvas">
      <main className="mx-auto w-full max-w-none">{children}</main>
    </div>
  );
}

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  const { detail, status, error, refresh } = useIncidentDetail(incidentId);

  if (status === "loading") {
    return (
      <Shell>
        <LoadingState message="Loading the live incident workspace…" />
      </Shell>
    );
  }

  if (!detail) {
    // A reachable runtime that has no such report is a different problem from a
    // runtime that never answered, and each needs a different next step.
    return (
      <Shell>
        {statusFromErrorMessage(error) === 404 ? (
          <NotFoundState incidentId={incidentId} />
        ) : (
          <RuntimeUnavailableState error={error} onRetry={() => void refresh()} />
        )}
      </Shell>
    );
  }

  const { report, candidates, evidence, investigation_steps: steps } = detail;
  const ranked = [...candidates].sort((left, right) => right.confidence - left.confidence);
  const winning = ranked.find((item) => item.candidate_id === report.winning_candidate_id);
  const lead = winning ?? ranked[0];
  const isInconclusive = report.status === "inconclusive";

  const citedIds = new Set(report.claims.flatMap((claim) => claim.evidence_ids));
  const cited = evidence.filter((item) => citedIds.has(item.evidence_id));
  const uncited = evidence.filter((item) => !citedIds.has(item.evidence_id));

  const segment = segmentLabel(lead?.dimensions);
  const causePath = [{ field: "Scope", value: "Global" }, ...describeDimensions(lead?.dimensions)];

  /* The contract already carries the numbers the hero was missing. Nothing here is
     derived from anything the runtime did not send. */
  const heroStats = [
    lead
      ? {
          label: "Approval delta",
          value: approvalDeltaPp(lead.baseline_decline_rate, lead.current_decline_rate),
          note: `${percent(lead.baseline_decline_rate)} → ${percent(lead.current_decline_rate)} decline rate`,
          tone: "text-signal-critical",
        }
      : {
          label: "Approval delta",
          value: "—",
          note: "No candidate carries decline rates",
          tone: "text-pharos-strong",
        },
    {
      label: "Affected volume",
      value: lead ? integer(lead.affected_count) : "—",
      note: lead ? "transactions in this segment" : "No candidate volume reported",
      tone: "text-pharos-strong",
    },
    {
      label: "Revenue at risk",
      value: `${usd(report.estimated_revenue_loss_usd_per_hour)}/hr`,
      note: "rate while the segment stays degraded",
      tone: "text-pharos-strong",
    },
    {
      label: "Report generated",
      value: time(report.generated_at),
      note: `${DISPLAY_TIME_ZONE_LABEL} · ${cited.length} evidence items cited`,
      tone: "text-pharos-strong",
    },
  ];

  return (
    <Shell>
      <header className="incident-hero">
        <div className="relative z-10">
          <nav className="flex items-center gap-2 text-[11px] font-medium text-pharos-faint" aria-label="Breadcrumb">
            <Link href="/investigations" className="transition hover:text-white">
              Investigations
            </Link>
            <span aria-hidden="true">/</span>
            <code className="font-mono text-pharos-muted">{report.incident_id}</code>
          </nav>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <ReportStatusBadge status={report.status} />
            <HumanReviewChip required={report.requires_human_review} />
            {lead?.dominant_decline_code ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-pharos-line bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-pharos-muted uppercase">
                {dimensionValueLabel("canonical_decline_code", lead.dominant_decline_code)}
              </span>
            ) : null}
          </div>

          <h1 className="mt-4 max-w-4xl text-[clamp(28px,3.6vw,44px)] leading-[1.04] font-medium tracking-[-0.06em] text-pharos-strong">
            {isInconclusive || !segment ? "No single cause meets the evidence threshold." : segment}
          </h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-6 text-pharos-muted">{report.summary}</p>
        </div>

        <dl className="relative z-10 mt-8 grid gap-px overflow-hidden rounded-2xl border border-pharos-line bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
          {heroStats.map((stat) => (
            <div key={stat.label} className="incident-hero-stat">
              <dt>{stat.label}</dt>
              <dd className={stat.tone}>{stat.value}</dd>
              <span>{stat.note}</span>
            </div>
          ))}
        </dl>
        <div className="pointer-events-none absolute -top-32 -right-12 size-80 rounded-full bg-pharos-accent/10 blur-3xl" />
      </header>

      <section className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.95fr)_minmax(300px,0.95fr)]">
        <div className="min-w-0 space-y-4">
          <article className="incident-workspace-card p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Cause path</p>
                <h2 className="mt-1 text-[21px] font-medium tracking-[-0.04em] text-pharos-ink">
                  {isInconclusive ? "Investigation scope, not a root cause" : "Most-supported segment"}
                </h2>
              </div>
              <Landmark className="size-5 shrink-0 text-pharos-accent" aria-hidden="true" />
            </div>

            <ol className="incident-cause-path mt-5">
              {causePath.map((node, index) => (
                <li key={node.field} className="flex items-center gap-2">
                  <span
                    className={
                      index === causePath.length - 1 && !isInconclusive
                        ? "incident-cause-node incident-cause-node-strong"
                        : "incident-cause-node"
                    }
                  >
                    <em>{node.field}</em>
                    {node.value}
                  </span>
                  {index < causePath.length - 1 ? (
                    <ChevronRight className="size-3 shrink-0 text-pharos-faint" aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ol>

            {lead?.counterfactual_check ? (
              <div className="mt-5 rounded-2xl border border-signal-healthy/20 bg-signal-healthy/[0.05] p-4">
                <p className="eyebrow text-signal-healthy">Counterfactual control</p>
                <p className="mt-2 text-sm leading-6 text-pharos-ink">{lead.counterfactual_check}</p>
              </div>
            ) : (
              <p className="mt-5 text-sm leading-6 text-pharos-faint">
                No discriminating counterfactual control is available for this candidate yet.
              </p>
            )}
          </article>

          <article className="incident-workspace-card p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Evidence board</p>
                <h2 className="mt-1 text-[22px] font-medium tracking-[-0.045em] text-pharos-ink">
                  What supports the investigation
                </h2>
              </div>
              <FileSearch className="size-5 shrink-0 text-pharos-accent" aria-hidden="true" />
            </div>

            {cited.length ? (
              <div className="mt-5 space-y-4">
                {groupEvidence(cited).map(([group, items]) => (
                  <section key={group}>
                    <p className="eyebrow">{group}</p>
                    <div className="mt-2 divide-y divide-white/[0.07] overflow-hidden rounded-2xl border border-pharos-line bg-black/[0.14]">
                      {items.map((item) => (
                        <div key={item.evidence_id} className="incident-evidence-row">
                          <div className="incident-evidence-index">
                            {item.value === undefined ? "·" : percent(item.value)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm leading-6 text-pharos-ink">{item.summary}</p>
                            {item.dimension_key ? (
                              <p className="mt-1 font-mono text-[10px] break-all text-pharos-faint">
                                {item.dimension_key}
                              </p>
                            ) : null}
                          </div>
                          <code className="self-start font-mono text-[10px] text-pharos-faint">
                            {item.evidence_id}
                          </code>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-pharos-faint">
                No citable evidence has been returned for this report.
              </p>
            )}

            <div className="mt-6 space-y-2 border-t border-pharos-line pt-5">
              <p className="eyebrow">Claims, each tied to its evidence</p>
              {report.claims.map((claim) => (
                <div key={claim.claim} className="incident-claim">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-pharos-accent" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm leading-6 text-pharos-ink">{claim.claim}</p>
                    <p className="mt-1.5 text-[10px] text-pharos-faint">
                      {percent(claim.confidence)} confidence ·{" "}
                      {claim.evidence_ids.length ? (
                        <span className="font-mono">{claim.evidence_ids.join(", ")}</span>
                      ) : (
                        "no evidence cited"
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {uncited.length ? (
              <p className="mt-5 text-[11px] leading-5 text-pharos-faint">
                {uncited.length} further evidence item{uncited.length === 1 ? " was" : "s were"} collected but not
                cited by any claim.
              </p>
            ) : null}
          </article>

          <article className="incident-workspace-card p-5 md:p-6">
            <p className="eyebrow">Hypotheses evaluated</p>
            <h2 className="mt-1 text-[22px] font-medium tracking-[-0.04em] text-pharos-ink">
              {isInconclusive ? "Close explanations, no asserted cause" : "Ranked investigation candidates"}
            </h2>
            <div className="mt-5 space-y-2">
              {ranked.slice(0, 3).map((item) => (
                <CandidateRow key={item.candidate_id} candidate={item} winning={item.candidate_id === report.winning_candidate_id} />
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-5 text-pharos-faint">
              Candidates the runtime did not return are not shown. The contract carries no field for a
              discarded hypothesis or its reason, so none is invented here.
            </p>
          </article>

          <article className="incident-recommendation">
            <div className="relative z-10">
              <p className="eyebrow">Recommended human action</p>
              <h2 className="mt-1 text-[22px] font-medium tracking-[-0.045em] text-pharos-strong">
                Review before any external change.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-pharos-muted">{report.recommended_action}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-signal-warning/20 bg-signal-warning/[0.07] px-3 py-1.5 text-[10px] font-semibold text-signal-warning">
                <ShieldCheck className="size-3.5" aria-hidden="true" /> Recommendation only — no traffic was
                rerouted
              </span>
            </div>
            <div className="pointer-events-none absolute -right-12 -bottom-12 size-44 rounded-full bg-pharos-accent/10 blur-3xl" />
          </article>
        </div>

        <aside className="incident-timeline-card lg:sticky lg:top-24">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Investigation timeline</p>
              <h2 className="mt-1 text-[19px] font-medium tracking-[-0.04em] text-pharos-ink">The incident story</h2>
            </div>
            <RuntimeIndicator status={status} />
          </div>
          <p className="mt-3 text-xs leading-5 text-pharos-faint">
            Only steps the runtime recorded are shown — no internal reasoning, and nothing animated that did not
            arrive.
          </p>

          <ol className="mt-6">
            {steps.length ? (
              steps.map((step, index) => (
                <li key={step.step_id} className="incident-timeline-entry">
                  <span
                    className={
                      index === steps.length - 1
                        ? "incident-timeline-dot incident-timeline-dot-live"
                        : "incident-timeline-dot"
                    }
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.09em] text-pharos-accent uppercase">
                      {actionLabel(step.action)}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-pharos-ink">{step.result_summary}</p>
                    <time className="mt-2 block text-[10px] text-pharos-faint" dateTime={step.timestamp}>
                      {time(step.timestamp)} {DISPLAY_TIME_ZONE_LABEL}
                    </time>
                  </div>
                </li>
              ))
            ) : (
              <li className="text-sm text-pharos-faint">
                Waiting for evidence — no investigation step has been recorded for this report.
              </li>
            )}
          </ol>

          <p className="mt-6 border-t border-pharos-line pt-4 text-[11px] leading-5 text-pharos-faint">
            The incident API returns candidates, evidence and steps. It does not expose the anomaly or baseline
            series, so this workspace shows no approval chart rather than a fabricated one.
          </p>
        </aside>
      </section>
    </Shell>
  );
}

function CandidateRow({ candidate, winning }: { candidate: IncidentCandidate; winning: boolean }) {
  const label = segmentLabel(candidate.dimensions) ?? "Unscoped segment";
  return (
    <div
      className={
        winning
          ? "incident-hypothesis incident-hypothesis-supported"
          : "incident-hypothesis incident-hypothesis-less-evidence"
      }
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase">
            {winning ? "Supported by cited evidence" : "Alternative explanation"}
          </span>
          <span className="text-[10px] text-pharos-faint">
            {percent(candidate.confidence)} confidence · priority {candidate.rca_score.toFixed(2)}
          </span>
        </div>
        <p className="mt-1.5 text-sm font-semibold text-pharos-ink">{label}</p>
        <p className="mt-1.5 text-[11px] text-pharos-faint">
          {integer(candidate.affected_count)} affected ·{" "}
          {approvalDeltaPp(candidate.baseline_decline_rate, candidate.current_decline_rate)} approval ·{" "}
          {usd(candidate.estimated_revenue_loss_usd_per_hour)}/hr
        </p>
        <p className="mt-1.5 text-[12px] leading-5 text-pharos-muted">
          {candidate.counterfactual_check ?? "No discriminating evidence is available for this hypothesis yet."}
        </p>
      </div>
    </div>
  );
}
