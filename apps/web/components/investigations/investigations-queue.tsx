"use client";

import Link from "next/link";
import { ArrowUpRight, CircleAlert, Clock3, FileSearch, ShieldCheck } from "lucide-react";
import { useIncidentReports } from "@/lib/api/use-control-tower";
import { percent, time, usd } from "@/lib/format";

export function InvestigationsQueue() {
  const { reports, status, error } = useIncidentReports();
  const atRisk = reports.reduce((total, report) => total + report.estimated_revenue_loss_usd_per_hour, 0);

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
            <div><span>Runtime</span><strong>{status === "live" ? "Connected" : status === "loading" ? "Connecting" : "Unavailable"}</strong></div>
            <div><span>Active cases</span><strong>{reports.length}</strong></div>
            <div><span>At risk</span><strong>{usd(atRisk)}/hr</strong></div>
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
              <span className="text-[11px] text-[#a99dab]">Polling the runtime every 10 seconds</span>
            </div>

            {status === "unavailable" ? (
              <div className="investigation-queue-card text-sm leading-6 text-[#d7c9da]">
                The Control Tower API is not reachable. Start the engine or set <code>NEXT_PUBLIC_CONTROL_TOWER_API_ORIGIN</code>. {error}
              </div>
            ) : null}
            {status === "loading" ? <div className="investigation-queue-card text-sm text-[#c8bdcb]">Loading live incident reports…</div> : null}
            {status === "live" && reports.length === 0 ? <div className="investigation-queue-card text-sm text-[#c8bdcb]">No incident report has been generated yet.</div> : null}
            <div className="space-y-3">
              {reports.map((report) => {
                const inconclusive = report.status === "inconclusive";
                const latestClaim = report.claims[0];
                return (
                  <article key={report.incident_id} className="investigation-queue-card">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="queue-severity queue-severity-medium">LIVE REPORT</span>
                          <span className={inconclusive ? "queue-status queue-status-inconclusive" : "queue-status"}>
                            {inconclusive ? "Evidence insufficient" : report.status === "confirmed" ? "Confirmed cause" : "Probable cause"}
                          </span>
                        </div>
                        <h3 className="mt-3 text-[20px] font-medium tracking-[-0.04em] text-[#f5edf7]">{report.incident_id}</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#b7abbc]">{report.summary}</p>
                      </div>
                      <Link href={`/incidents/${report.incident_id}`} className="queue-open-link">Open investigation <ArrowUpRight className="size-3.5" /></Link>
                    </div>
                    <dl className="investigation-facts">
                      <div><dt>Generated</dt><dd>{time(report.generated_at)}</dd></div>
                      <div><dt>Revenue at risk</dt><dd>{usd(report.estimated_revenue_loss_usd_per_hour)}/hr</dd></div>
                      <div><dt>Evidence confidence</dt><dd>{latestClaim ? percent(latestClaim.confidence) : "—"}</dd></div>
                      <div><dt>Human review</dt><dd>{report.requires_human_review ? "Required" : "Not required"}</dd></div>
                    </dl>
                    <div className="investigation-card-footer">
                      <div><span>Recommendation</span><p>{report.recommended_action}</p></div>
                      <div><span>Cited evidence</span><p>{latestClaim?.evidence_ids.join(", ") || "Not established"}</p></div>
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
            <p className="mt-3 text-xs leading-5 text-[#b7abbc]">The queue deliberately separates report status from the evidence cited for it. It never executes its recommendation.</p>
            <div className="mt-6 space-y-4 border-t border-white/[0.08] pt-5">
              <div className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#8de4ca]" /><p><strong>Probable</strong><span>Evidence supports a leading explanation and a human check.</span></p></div>
              <div className="flex gap-3"><CircleAlert className="mt-0.5 size-4 shrink-0 text-[#c9b3f4]" /><p><strong>Inconclusive</strong><span>Competing explanations remain open; no cause is asserted.</span></p></div>
              <div className="flex gap-3"><Clock3 className="mt-0.5 size-4 shrink-0 text-[#e5bd8a]" /><p><strong>Human review</strong><span>Every recommendation remains an operator decision.</span></p></div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
