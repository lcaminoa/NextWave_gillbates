"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Activity,
  Banknote,
  ChevronRight,
  Gauge,
  MonitorUp,
  Network,
  SearchCheck,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IncidentCard } from "@/components/incidents/incident-card";
import { Metric } from "@/components/ui/metric";
import { AffectedCorridors } from "./affected-corridors";
import { EmptyState, RuntimeUnavailableState } from "@/components/ui/states";
import { RuntimeIndicator } from "@/components/ui/status";
import { useIncidentDetail, useIncidentReports, useTransactionStream } from "@/lib/api/use-control-tower";
import { actionLabel, dimensionValueLabel, segmentLabel } from "@/lib/dimensions";
import { DISPLAY_TIME_ZONE_LABEL, integer, percent, ratePerMinute, time, usd } from "@/lib/format";


/**
 * Below this many streamed transactions an approval rate is noise, not a signal.
 * The old dashboard published whatever the rolling buffer held: the same session
 * read 87.5% at one width and 66.7% at another, with no sample size on screen.
 */
const MIN_APPROVAL_SAMPLE = 40;

export function ControlTowerDashboard() {
  const { reports, status: reportsStatus, error: reportsError, refresh } = useIncidentReports();
  const { transactions, status: streamStatus } = useTransactionStream();
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);

  const selectedReport = reports.find((report) => report.incident_id === selectedIncidentId) ?? null;
  const activeReport = selectedReport ?? reports[0] ?? null;
  const { detail: activeDetail } = useIncidentDetail(activeReport?.incident_id ?? null);

  const activeCandidate =
    activeDetail?.candidates.find((candidate) => candidate.candidate_id === activeReport?.winning_candidate_id)
    ?? activeDetail?.candidates[0];

  /** Observed approval over the transactions this browser has actually received. */
  const sample = useMemo(() => {
    if (transactions.length < 2) return null;
    const timestamps = transactions.map((transaction) => new Date(transaction.timestamp).getTime());
    const spanMs = Math.max(...timestamps) - Math.min(...timestamps);
    return {
      size: transactions.length,
      approvalRate: transactions.filter((transaction) => transaction.approved).length / transactions.length,
      perMinute: ratePerMinute(transactions.length, spanMs),
    };
  }, [transactions]);

  const hasEnoughSample = (sample?.size ?? 0) >= MIN_APPROVAL_SAMPLE;
  const atRisk = reports.reduce((total, report) => total + report.estimated_revenue_loss_usd_per_hour, 0);
  const inconclusiveCount = reports.filter((report) => report.status === "inconclusive").length;


  const activeSegment = segmentLabel(activeCandidate?.dimensions);
  const steps = activeDetail?.investigation_steps ?? [];

  return (
    <div className={presentationMode ? "control-canvas presentation-mode" : "control-canvas"}>
      <main className="mx-auto w-full max-w-none">
          <header className="control-room-hero flex flex-wrap items-start justify-between gap-4">
            <div className="relative z-10 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <RuntimeIndicator
                  status={streamStatus}
                  label={streamStatus === "live" ? "STREAM LIVE" : streamStatus === "loading" ? "CONNECTING" : "STREAM OFFLINE"}
                />
                <span className="text-micro text-pharos-faint">
                  {reportsStatus === "live"
                    ? "Reports polled every 10s"
                    : reportsStatus === "loading"
                      ? "Loading reports"
                      : "Reports unavailable"}
                </span>
              </div>
              <h1 className="mt-3 text-display font-medium text-pharos-strong">
                Payment health, <span className="text-pharos-accent">with evidence.</span>
              </h1>
              <p className="mt-1 text-small text-pharos-muted">
                Live transaction stream and active investigations from the PHAROS runtime.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={presentationMode}
              className="relative z-10 rounded-full border border-pharos-line bg-black/25 px-3 text-pharos-muted hover:bg-white/[0.07] hover:text-white"
              onClick={() => setPresentationMode((value) => !value)}
            >
              <MonitorUp className="size-3.5" aria-hidden="true" />
              {presentationMode ? "Exit presentation" : "Presentation mode"}
            </Button>
          </header>

          {/* Global status bar. Every value carries its unit and an interpretation. */}
          <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Runtime status">
            <Metric
              label="Observed approval"
              value={hasEnoughSample && sample ? percent(sample.approvalRate) : "—"}
              caption={
                hasEnoughSample && sample
                  ? `Across ${integer(sample.size)} streamed transactions. No expected range: the API does not publish BaselinePoint yet.`
                  : `Sample too small — ${integer(sample?.size ?? 0)} of ${MIN_APPROVAL_SAMPLE} transactions needed before a rate means anything.`
              }
              tone={hasEnoughSample ? "neutral" : "uncertain"}
              icon={<Gauge className="size-4" aria-hidden="true" />}
            />
            <Metric
              label="Live volume"
              value={sample?.perMinute ? integer(sample.perMinute) : "—"}
              unit={sample?.perMinute ? "tx/min" : undefined}
              caption={
                sample?.perMinute
                  ? "Measured over the transactions held in this browser session."
                  : "Waiting for the transaction stream."
              }
              icon={<Waves className="size-4" aria-hidden="true" />}
            />
            <Metric
              label="Revenue at risk"
              value={reports.length ? usd(atRisk) : "—"}
              unit={reports.length ? "/hour" : undefined}
              caption={
                reports.length
                  ? `Rate reported across ${reports.length} open report${reports.length === 1 ? "" : "s"}, not an accumulated total.`
                  : "No report is claiming revenue exposure."
              }
              tone={atRisk > 0 ? "critical" : "neutral"}
              icon={<Banknote className="size-4" aria-hidden="true" />}
            />
            <Metric
              label="Active investigations"
              // Never publish a count the runtime did not confirm: an unreachable
              // runtime reads "—", not a reassuring zero.
              value={reportsStatus === "live" ? reports.length : "—"}
              caption={
                reportsStatus !== "live"
                  ? "No report state is available while the runtime is unreachable."
                  : reports.length
                    ? inconclusiveCount
                      ? `${inconclusiveCount} of them remain inconclusive — no cause asserted.`
                      : "All open reports name a leading explanation."
                    : "The runtime has not opened an investigation."
              }
              tone={inconclusiveCount ? "uncertain" : "neutral"}
              icon={<SearchCheck className="size-4" aria-hidden="true" />}
            />
          </section>

          {reportsStatus === "unavailable" ? (
            <RuntimeUnavailableState className="mt-3" error={reportsError} onRetry={() => void refresh()} />
          ) : null}

          {/* Evidence first: the queue and the investigation it is producing sit
              above the fold, where a 590px globe used to be. Both panels stand down
              entirely when the runtime is unreachable — two empty frames under an
              error banner read as breakage, not as an absence of incidents. */}
          {reportsStatus !== "unavailable" ? (
          <section className="mt-3 grid items-start gap-3 xl:grid-cols-12">
            <article className="control-card p-5 xl:col-span-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Active investigations</p>
                  <h2 className="mt-1 text-section font-medium text-pharos-ink">
                    Prioritised by reported impact
                  </h2>
                </div>
                <Link
                  href="/investigations"
                  className="inline-flex items-center gap-1 text-micro font-semibold text-pharos-accent transition hover:text-pharos-strong"
                >
                  Open queue <ArrowUpRight className="size-3" aria-hidden="true" />
                </Link>
              </div>

              <div className="mt-4 space-y-2">
                {reports.length ? (
                  [...reports]
                    .sort(
                      (left, right) =>
                        right.estimated_revenue_loss_usd_per_hour - left.estimated_revenue_loss_usd_per_hour,
                    )
                    .slice(0, 3)
                    .map((report) => (
                      <IncidentCard
                        key={report.incident_id}
                        report={report}
                        density="compact"
                        selected={report.incident_id === activeReport?.incident_id}
                        onSelect={setSelectedIncidentId}
                      />
                    ))
                ) : reportsStatus === "live" ? (
                  <EmptyState
                    title="No incident is open"
                    body="The stream is being watched and the baseline is holding. A report appears here only once an anomaly is confirmed over several windows."
                    icon={<ShieldCheck className="size-6" aria-hidden="true" />}
                  />
                ) : null}
              </div>
            </article>

            <article className="control-card flex flex-col p-5 xl:col-span-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">Investigation lane</p>
                  <h2 className="mt-1 truncate text-section font-medium text-pharos-ink">
                    {activeSegment ?? "Observable steps"}
                  </h2>
                </div>
                <Activity className="size-4 shrink-0 text-pharos-accent" aria-hidden="true" />
              </div>

              <ol className="mt-4 flex-1 space-y-3">
                {steps.length ? (
                  steps.slice(-4).map((step, index, visible) => (
                    <li key={step.step_id} className="relative flex gap-3">
                      {index !== visible.length - 1 ? (
                        <span className="absolute top-5 left-[7px] h-full border-l border-dashed border-white/15" />
                      ) : null}
                      <span className={index === visible.length - 1 ? "timeline-dot timeline-dot-live" : "timeline-dot"} />
                      <div className="min-w-0 pb-1">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <span className="text-micro font-semibold text-pharos-ink">{actionLabel(step.action)}</span>
                          <time className="text-micro text-pharos-faint" dateTime={step.timestamp}>
                            {time(step.timestamp)} {DISPLAY_TIME_ZONE_LABEL}
                          </time>
                        </div>
                        <p className="mt-0.5 text-micro leading-5 text-pharos-muted">{step.result_summary}</p>
                      </div>
                    </li>
                  ))
                ) : (
                  <li>
                    <EmptyState
                      className="px-4 py-8"
                      title={activeReport ? "Waiting for evidence" : "No investigation selected"}
                      body={
                        activeReport
                          ? "This report has no recorded investigation step yet. Nothing is animated until the runtime sends one."
                          : "Select an open report to follow the steps the runtime recorded while investigating it."
                      }
                    />
                  </li>
                )}
              </ol>

              {activeReport ? (
                <Link
                  href={`/incidents/${activeReport.incident_id}`}
                  className="mt-4 inline-flex items-center gap-1 text-micro font-semibold text-pharos-accent transition hover:text-pharos-strong"
                >
                  Open full investigation <ChevronRight className="size-3" aria-hidden="true" />
                </Link>
              ) : null}
            </article>
          </section>
          ) : null}

          {/* Secondary by placement: it sits below the evidence, never above it. */}
          <AffectedCorridors reports={reports} transactions={transactions} />

          <section className="control-card mt-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Live payment stream</p>
                <h2 className="mt-1 text-section font-medium text-pharos-ink">Recent transactions</h2>
              </div>
              <Network className="size-4 text-pharos-faint" aria-hidden="true" />
            </div>
            <div className="mt-3 grid gap-x-6 md:grid-cols-2">
              {transactions.slice(0, 6).map((transaction) => (
                <div
                  key={transaction.transaction_id}
                  className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={transaction.approved ? "stream-state stream-approved" : "stream-state stream-declined"}>
                      {transaction.approved ? "✓" : "×"}
                    </span>
                    <p className="truncate text-micro text-pharos-muted">
                      {dimensionValueLabel("country", transaction.country)} ·{" "}
                      {dimensionValueLabel("provider", transaction.provider)} ·{" "}
                      {dimensionValueLabel("payment_method", transaction.payment_method)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-micro font-medium text-pharos-ink">{usd(transaction.amount, 2)}</p>
                    <p className="text-nano text-pharos-faint">{transaction.latency_ms} ms</p>
                  </div>
                </div>
              ))}
              {!transactions.length ? (
                <p className="py-8 text-center text-sm text-pharos-faint md:col-span-2">
                  {streamStatus === "unavailable"
                    ? "The transaction stream is disconnected."
                    : "Waiting for streamed transactions."}
                </p>
              ) : null}
            </div>
          </section>
      </main>

    </div>
  );
}
