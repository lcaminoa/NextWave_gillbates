"use client";

import Link from "next/link";

import { CircleAlert, Clock3, FileSearch, ShieldCheck } from "lucide-react";
import { IncidentCard } from "@/components/incidents/incident-card";
import { EmptyState, LoadingState, RuntimeUnavailableState } from "@/components/ui/states";
import { useIncidentReports } from "@/lib/api/use-control-tower";
import { usd } from "@/lib/format";

const readingGuide = [
  {
    icon: ShieldCheck,
    tone: "text-signal-info",
    title: "Confirmed & probable",
    body: "Evidence supports a leading explanation and a human check.",
  },
  {
    icon: CircleAlert,
    tone: "text-signal-uncertain",
    title: "Inconclusive",
    body: "Competing explanations remain open; no cause is asserted.",
  },
  {
    icon: Clock3,
    tone: "text-signal-warning",
    title: "Human review",
    body: "Every recommendation remains an operator decision.",
  },
];

export function InvestigationsQueue() {
  const { reports, status, error, refresh } = useIncidentReports();
  const atRisk = reports.reduce((total, report) => total + report.estimated_revenue_loss_usd_per_hour, 0);

  // Impact ordering, stated on screen. rca_score is a technical priority and lives on
  // the candidate, not the report, so the queue ranks by the figure it actually has.
  const ranked = [...reports].sort(
    (left, right) => right.estimated_revenue_loss_usd_per_hour - left.estimated_revenue_loss_usd_per_hour,
  );

  return (
    <div className="control-canvas investigations-canvas">
      <main className="mx-auto w-full max-w-none">
        <header className="investigations-hero">
          <div className="relative z-10">
            <p className="eyebrow">Investigation queue</p>
            <h1 className="mt-2 text-display font-medium text-pharos-strong">
              Evidence before <span className="text-pharos-accent">conclusion.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-pharos-muted">
              Active payment anomalies ranked by reported business impact. Each case stays open until its
              evidence supports a human decision.
            </p>
          </div>
          <div className="investigations-summary relative z-10">
            <div>
              <span>Runtime</span>
              <strong>{status === "live" ? "Connected" : status === "loading" ? "Connecting" : "Unavailable"}</strong>
            </div>
            <div>
              <span>Open cases</span>
              <strong>{status === "live" ? reports.length : "—"}</strong>
            </div>
            <div>
              <span>At risk</span>
              <strong>{status === "live" && reports.length ? `${usd(atRisk)}/hr` : "—"}</strong>
            </div>
          </div>
        </header>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="investigation-queue min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3 px-1 pb-3">
              <div>
                <p className="eyebrow">Priority queue</p>
                <h2 className="mt-1 text-title font-medium text-pharos-ink">
                  Open evidence workspaces
                </h2>
              </div>
              <span className="text-micro text-pharos-faint">
                Ranked by revenue at risk · polled every 10 seconds
              </span>
            </div>

            {status === "loading" ? <LoadingState message="Loading live incident reports…" /> : null}

            {status === "unavailable" ? (
              <RuntimeUnavailableState error={error} onRetry={() => void refresh()} />
            ) : null}

            {status === "live" && !reports.length ? (
              <EmptyState
                title="The queue is empty"
                body="No anomaly has been sustained long enough to open an investigation. This is what a healthy stream looks like."
                icon={<ShieldCheck className="size-6" aria-hidden="true" />}
                action={
                  <Link href="/#worked-example" className="empty-state-link">
                    See a worked investigation
                  </Link>
                }
              />
            ) : null}

            <div className="space-y-3">
              {ranked.map((report) => (
                <IncidentCard key={report.incident_id} report={report} />
              ))}
            </div>
          </div>

          <aside className="investigations-sidecard xl:sticky xl:top-24">
            <FileSearch className="size-5 text-pharos-accent" aria-hidden="true" />
            <p className="eyebrow mt-5">How to read this queue</p>
            <h2 className="mt-1 text-section font-medium text-pharos-ink">
              Priority is not certainty.
            </h2>
            <p className="mt-3 text-xs leading-5 text-pharos-muted">
              Ordering reflects reported impact. Report status reflects the evidence behind the explanation.
              They are separate readings, and the queue never executes its own recommendation.
            </p>
            <div className="mt-6 space-y-4 border-t border-pharos-line pt-5">
              {readingGuide.map((entry) => {
                const Icon = entry.icon;
                return (
                  <div key={entry.title} className="flex gap-3">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${entry.tone}`} aria-hidden="true" />
                    <p>
                      <strong>{entry.title}</strong>
                      <span>{entry.body}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
