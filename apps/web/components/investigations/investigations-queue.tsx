import Link from "next/link";
import { ArrowUpRight, CircleAlert, Clock3, FileSearch, ShieldCheck } from "lucide-react";
import { anomalies, candidates, evidence, investigationSteps, reports } from "@/lib/fixtures/control-tower";
import type { Dimensions, Severity } from "@/lib/contracts";
import { deltaPp, percent, time, usd } from "@/lib/format";

const severityClass: Record<Severity, string> = {
  low: "queue-severity-low",
  medium: "queue-severity-medium",
  high: "queue-severity-high",
  critical: "queue-severity-critical",
};

function dimensionLabel(dimensions?: Dimensions) {
  if (!dimensions) return "No single cause isolated";
  return [dimensions.provider, dimensions.country, dimensions.payment_method, dimensions.issuing_bank].filter(Boolean).join(" · ");
}

export function InvestigationsQueue() {
  return (
    <div className="control-canvas investigations-canvas">
      <main className="mx-auto w-full max-w-none">
        <header className="investigations-hero">
          <div className="relative z-10">
            <p className="eyebrow">Investigation queue</p>
            <h1 className="mt-2 text-[clamp(31px,4vw,48px)] font-medium tracking-[-0.065em] text-[#fbf7fc]">
              Evidence before <span className="text-[#dca6dd]">conclusion.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b8adbd]">
              Active payment anomalies ranked by business impact. Each case stays open until its evidence supports a human decision.
            </p>
          </div>
          <div className="investigations-summary relative z-10">
            <div>
              <span>Active cases</span>
              <strong>{reports.length}</strong>
            </div>
            <div>
              <span>Human review</span>
              <strong>{reports.filter((report) => report.requires_human_review).length} required</strong>
            </div>
            <div>
              <span>At risk</span>
              <strong>{usd(reports.reduce((total, report) => total + report.estimated_revenue_loss_usd, 0))}/hr</strong>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-12 -top-28 size-80 rounded-full bg-[#d393d6]/10 blur-3xl" />
        </header>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="investigation-queue">
            <div className="flex flex-wrap items-end justify-between gap-3 px-1 pb-3">
              <div>
                <p className="eyebrow">Priority queue</p>
                <h2 className="mt-1 text-[21px] font-medium tracking-[-0.04em] text-[#f8f1f9]">Open evidence workspaces</h2>
              </div>
              <span className="text-[11px] text-[#a99dab]">Sorted by impact and signal severity</span>
            </div>

            <div className="space-y-3">
              {reports.map((report) => {
                const anomaly = anomalies.find((item) => item.anomaly_id === report.anomaly_id);
                const candidate = candidates.find((item) => item.candidate_id === report.winning_candidate_id);
                const latestStep = investigationSteps.filter((step) => report.investigation_steps.includes(step.step_id)).slice(-1)[0];
                const reportEvidence = evidence.find((item) => report.claims.flatMap((claim) => claim.evidence_ids).includes(item.evidence_id));
                const inconclusive = report.status === "inconclusive";

                return (
                  <article key={report.incident_id} className="investigation-queue-card">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={"queue-severity " + severityClass[anomaly?.severity ?? "low"]}>{(anomaly?.severity ?? "low").toUpperCase()}</span>
                          <span className={inconclusive ? "queue-status queue-status-inconclusive" : "queue-status"}>
                            {inconclusive ? "Evidence insufficient" : "Probable cause"}
                          </span>
                        </div>
                        <h3 className="mt-3 text-[20px] font-medium tracking-[-0.04em] text-[#f5edf7]">
                          {inconclusive ? "No single cause has reached the threshold" : dimensionLabel(candidate?.dimensions)}
                        </h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#b7abbc]">{report.summary}</p>
                      </div>
                      <Link href={`/incidents/${report.incident_id}`} className="queue-open-link">
                        Open investigation <ArrowUpRight className="size-3.5" />
                      </Link>
                    </div>

                    <dl className="investigation-facts">
                      <div>
                        <dt>Approval delta</dt>
                        <dd className="text-[#f5a1b5]">{anomaly ? deltaPp(anomaly.observed_approval_rate, anomaly.expected_approval_rate) : "—"}</dd>
                      </div>
                      <div>
                        <dt>Revenue at risk</dt>
                        <dd>{usd(report.estimated_revenue_loss_usd)}/hr</dd>
                      </div>
                      <div>
                        <dt>Detected</dt>
                        <dd>{anomaly ? time(anomaly.detected_at) : "Awaiting signal"}</dd>
                      </div>
                      <div>
                        <dt>Evidence confidence</dt>
                        <dd>{percent(report.claims[0]?.confidence ?? 0)}</dd>
                      </div>
                    </dl>

                    <div className="investigation-card-footer">
                      <div>
                        <span>Latest investigation step</span>
                        <p>{latestStep ? latestStep.result_summary : "Waiting for recorded investigation evidence."}</p>
                      </div>
                      <div>
                        <span>Cited evidence</span>
                        <p>{reportEvidence?.evidence_id ?? "Not established"}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="investigations-sidecard xl:sticky xl:top-24">
            <FileSearch className="size-5 text-[#d9a8dc]" />
            <p className="eyebrow mt-5">How to read this queue</p>
            <h2 className="mt-1 text-[19px] font-medium tracking-[-0.04em] text-[#f7f0f8]">Priority is not certainty.</h2>
            <p className="mt-3 text-xs leading-5 text-[#b7abbc]">Cases are ordered by impact and signal severity. The evidence status says whether the system can actually assert a cause.</p>
            <div className="mt-6 space-y-4 border-t border-white/[0.08] pt-5">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#8de4ca]" />
                <p><strong>Probable</strong><span>Evidence supports a leading explanation and a human check.</span></p>
              </div>
              <div className="flex gap-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#c9b3f4]" />
                <p><strong>Inconclusive</strong><span>Competing explanations remain open; no cause is asserted.</span></p>
              </div>
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 size-4 shrink-0 text-[#e5bd8a]" />
                <p><strong>Human review</strong><span>Every recommendation remains an operator decision.</span></p>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
