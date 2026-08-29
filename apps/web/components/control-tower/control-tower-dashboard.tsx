"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  ChevronRight,
  Clock3,
  Gauge,
  Globe2,
  MonitorUp,
  Network,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApprovalChart } from "@/components/control-tower/approval-chart";
import RotatingEarth, { type GlobeHotspot } from "@/components/ui/wireframe-dotted-globe";
import { anomalies, candidates, evidence, investigationSteps, reports, transactions } from "@/lib/fixtures/control-tower";
import { deltaPp, integer, percent, time, usd } from "@/lib/format";
import type { Dimensions } from "@/lib/contracts";

const severityStyles = {
  high: "border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fda4b4]",
  medium: "border-[#fbbf24]/30 bg-[#fbbf24]/10 text-[#fcd66d]",
  low: "border-[#60a5fa]/30 bg-[#60a5fa]/10 text-[#93c5fd]",
  critical: "border-[#fb7185]/40 bg-[#fb7185]/15 text-[#fecdd3]",
};

function displayDimensions(dimensions: Dimensions) {
  const labels = [dimensions.provider, dimensions.country, dimensions.payment_method, dimensions.issuing_bank].filter(Boolean);
  return labels.join(" · ");
}

export function ControlTowerDashboard() {
  const [selectedIncidentId, setSelectedIncidentId] = useState(reports[0].incident_id);
  const [presentationMode, setPresentationMode] = useState(false);
  const selectedReport = reports.find((report) => report.incident_id === selectedIncidentId) ?? reports[0];
  const selectedCandidate = candidates.find((candidate) => candidate.candidate_id === selectedReport.winning_candidate_id);
  const [selectedCountry, setSelectedCountry] = useState(selectedCandidate?.dimensions.country ?? "BR");

  const globeHotspots = useMemo<GlobeHotspot[]>(
    () => [
      {
        incidentId: "incident-br-novapay",
        country: "Brazil",
        countryCode: "BR",
        longitude: -51.9253,
        latitude: -14.235,
        label: "Brazil · NovaPay card · −31.4 pp",
        severity: "high",
      },
      {
        incidentId: "incident-mx-review",
        country: "Mexico",
        countryCode: "MX",
        longitude: -102.5528,
        latitude: 23.6345,
        label: "Mexico · under review · −11.3 pp",
        severity: "medium",
      },
    ],
    [],
  );
  const selectedHotspot = globeHotspots.find((hotspot) => hotspot.countryCode === selectedCountry) ?? globeHotspots[0];
  const geographicReport = reports.find((report) => report.incident_id === selectedHotspot.incidentId) ?? selectedReport;
  const geographicCandidate = candidates.find((candidate) => candidate.anomaly_id === geographicReport.anomaly_id);
  const geographicAnomaly = anomalies.find((anomaly) => anomaly.anomaly_id === geographicReport.anomaly_id);
  const geographicEvidenceIds = geographicReport.claims.flatMap((claim) => claim.evidence_ids);
  const geographicEvidence = evidence.find((item) => geographicEvidenceIds.includes(item.evidence_id));

  const selectIncident = (incidentId: string) => {
    const report = reports.find((item) => item.incident_id === incidentId);
    const candidate = candidates.find((item) => item.candidate_id === report?.winning_candidate_id);
    const hotspot = globeHotspots.find((item) => item.incidentId === incidentId);
    setSelectedIncidentId(incidentId);
    if (hotspot?.countryCode) setSelectedCountry(hotspot.countryCode);
    else if (candidate?.dimensions.country) setSelectedCountry(candidate.dimensions.country);
  };
  const selectHotspot = useCallback((hotspot: GlobeHotspot) => {
    setSelectedCountry(hotspot.countryCode);
    setSelectedIncidentId(hotspot.incidentId);
  }, []);

  return (
    <div className={presentationMode ? "control-canvas presentation-mode" : "control-canvas"}>
      <div className="control-shell">
        <main className="control-main">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="live-pill">
                  <Radio className="size-3 animate-pulse" />
                  LIVE
                </span>
                <span className="text-[11px] text-[#a69baa]">Demo time · 12:14:02 BRT</span>
              </div>
              <h1 className="mt-3 text-[31px] font-medium tracking-[-0.05em] text-[#fbf7fc]">
                Payment health, <span className="text-[#dca6dd]">with evidence.</span>
              </h1>
              <p className="mt-1 text-[13px] text-[#a89fad]">Global approval signals and active investigations.</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full border border-white/10 bg-black/25 px-3 text-[#bcb2c2] hover:bg-white/[0.07] hover:text-white"
                onClick={() => setPresentationMode((value) => !value)}
              >
                <MonitorUp className="size-3.5" />
                {presentationMode ? "Exit presentation" : "Presentation mode"}
              </Button>
            </div>
          </header>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
            <div className="segmented-control" aria-label="Dashboard view">
              <button type="button" className="segmented-active">Overview</button>
              <button type="button">Research lane</button>
              <button type="button">Network</button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#a79dab]">
              <Clock3 className="size-3.5" />
              Window: last 45 minutes
            </div>
          </div>

          <section className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-12">
            <div className="grid gap-3 md:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
              <article className="control-card metric-card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="eyebrow">Approval rate</p>
                    <p className="metric-value text-[#f6d0e9]">62.4%</p>
                  </div>
                  <span className="metric-icon metric-icon-alert">
                    <Gauge className="size-4" />
                  </span>
                </div>
                <p className="mt-3 text-xs text-[#bdafc3]">
                  <span className="font-medium text-[#f9a8b8]">−31.4 pp</span> below the expected range
                </p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-[#a579bb] to-[#fb7185]" />
                </div>
              </article>

              <article className="control-card metric-card relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="eyebrow">Research status</p>
                      <p className="mt-2 text-[17px] font-medium tracking-[-0.03em] text-[#f6eff8]">Evidence is converging</p>
                    </div>
                    <Sparkles className="size-4 text-[#dca6dd]" />
                  </div>
                  <p className="mt-2 max-w-[250px] text-xs leading-5 text-[#b8adbd]">
                    Provider control is healthy. The system is asking for a human review, not rerouting traffic.
                  </p>
                  <Link href="/incidents/incident-br-novapay" className="premium-action mt-4 inline-flex">
                    Open investigation <ChevronRight className="size-3.5" />
                  </Link>
                </div>
                <div className="absolute -bottom-16 -right-12 size-44 rounded-full bg-[#b866c4]/15 blur-3xl" />
              </article>
            </div>

            <article className="control-card min-h-[318px] p-5 xl:col-span-8">
              <div className="flex items-start justify-between">
                <div>
                  <p className="eyebrow">Active investigations</p>
                  <h2 className="mt-1 text-[17px] font-medium tracking-[-0.03em] text-[#f5eef7]">Prioritized by impact</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-medium text-[#c9bdce]">
                  {reports.length} active
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {reports.map((report) => {
                  const anomaly = anomalies.find((item) => item.anomaly_id === report.anomaly_id);
                  const candidate = candidates.find((item) => item.candidate_id === report.winning_candidate_id);
                  const isSelected = report.incident_id === selectedIncidentId;
                  const severity = anomaly?.severity ?? "low";
                  return (
                    <button
                      key={report.incident_id}
                      type="button"
                      onClick={() => selectIncident(report.incident_id)}
                      className={isSelected ? "incident-list-item incident-list-item-selected" : "incident-list-item"}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={"severity-badge " + severityStyles[severity]}>
                          {severity.toUpperCase()}
                        </span>
                        <span className={report.status === "inconclusive" ? "status-uncertain" : "status-probable"}>
                          {report.status === "inconclusive" ? "Evidence insufficient" : "Probable cause"}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-left text-[13px] font-medium text-[#f5edf7]">
                        {candidate ? displayDimensions(candidate.dimensions) : "No single cause reached threshold"}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#aaa0af]">
                        <span>{anomaly ? deltaPp(anomaly.observed_approval_rate, anomaly.expected_approval_rate) : "Under review"}</span>
                        <span>{usd(report.estimated_revenue_loss_usd)}/hour</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>

          </section>

          <section className="globe-stage control-card mt-3 overflow-hidden">
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
              <div>
                <p className="eyebrow">Impact geography</p>
                <h2 className="mt-1 text-[22px] font-medium tracking-[-0.04em] text-[#f7f0f8]">
                  Incidents, <span className="text-[#dca6dd]">located.</span>
                </h2>
                <p className="mt-1 text-xs text-[#aea2b4]">Select a signal to inspect its evidence-backed regional story.</p>
              </div>
              <Globe2 className="mt-1 size-4 text-[#c8b4d0]" />
            </div>

            <RotatingEarth
              height={530}
              className="globe-hero"
              hotspots={globeHotspots}
              selectedCountryCode={selectedCountry}
              onHotspotSelect={selectHotspot}
            />

            <div className="globe-location-list" aria-label="Incident locations">
              {globeHotspots.map((hotspot) => (
                <button
                  key={hotspot.countryCode}
                  type="button"
                  onClick={() => selectHotspot(hotspot)}
                  className={hotspot.countryCode === selectedCountry ? "globe-location-card globe-location-card-selected" : "globe-location-card"}
                >
                  <span className={"globe-location-dot globe-location-dot-" + hotspot.severity} />
                  <span>
                    <strong>{hotspot.country}</strong>
                    <small>{hotspot.severity === "high" ? "High-impact investigation" : "Evidence under review"}</small>
                  </span>
                </button>
              ))}
            </div>

            <aside className="globe-detail-card" aria-live="polite">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Selected location</p>
                  <h3 className="mt-1 text-lg font-medium tracking-[-0.035em] text-[#f9f2fa]">{selectedHotspot.country}</h3>
                </div>
                <span className={"severity-badge shrink-0 " + severityStyles[selectedHotspot.severity]}>
                  {selectedHotspot.severity}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#c9bdce]">{geographicReport.summary}</p>
              <dl className="globe-facts">
                <div>
                  <dt>Approval gap</dt>
                  <dd>{geographicAnomaly ? deltaPp(geographicAnomaly.observed_approval_rate, geographicAnomaly.expected_approval_rate) : "—"}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>{geographicCandidate ? percent(geographicCandidate.confidence) : "Inconclusive"}</dd>
                </div>
                <div>
                  <dt>At-risk payments</dt>
                  <dd>{geographicCandidate ? integer(geographicCandidate.affected_count) : "—"}</dd>
                </div>
                <div>
                  <dt>Business impact</dt>
                  <dd>{usd(geographicReport.estimated_revenue_loss_usd)}/hr</dd>
                </div>
              </dl>
              <div className="mt-3 border-t border-white/8 pt-3">
                <p className="eyebrow">Evidence in view</p>
                <p className="mt-1 text-[11px] leading-4 text-[#afa4b4]">{geographicEvidence?.summary ?? "No evidence citation is available yet."}</p>
              </div>
              <Link href={"/incidents/" + geographicReport.incident_id} className="premium-action mt-3 inline-flex">
                Open investigation <ChevronRight className="size-3.5" />
              </Link>
            </aside>
          </section>

          <section className="control-card mt-3 flex min-h-[332px] flex-col overflow-hidden p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Live approval performance</p>
                <h2 className="mt-1 text-[18px] font-medium tracking-[-0.035em] text-[#f6eff8]">
                  Approval rate vs. expected range
                </h2>
                <p className="mt-1 text-xs text-[#aaa0af]">
                  Observed rate is outside the Beta-Binomial credible interval across four windows.
                </p>
              </div>
              <div className="flex rounded-full border border-white/10 bg-black/20 p-0.5 text-[10px]">
                {["15m", "45m", "3h", "1d"].map((window) => (
                  <button
                    key={window}
                    type="button"
                    className={window === "45m" ? "chart-window chart-window-active" : "chart-window"}
                  >
                    {window}
                  </button>
                ))}
              </div>
            </div>
            <ApprovalChart />
          </section>

          <section className="mt-3 grid gap-3 lg:grid-cols-12">
            <article className="control-card p-5 lg:col-span-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Research lane</p>
                  <h2 className="mt-1 text-[17px] font-medium tracking-[-0.03em] text-[#f6eff8]">Observable investigation steps</h2>
                </div>
                <Activity className="size-4 text-[#c8b5d2]" />
              </div>
              <ol className="mt-4 space-y-3">
                {investigationSteps.slice(0, 3).map((step, index) => (
                  <li key={step.step_id} className="relative flex gap-3">
                    {index !== 2 ? <span className="absolute left-[7px] top-5 h-6 border-l border-dashed border-white/15" /> : null}
                    <span className={index === 2 ? "timeline-dot timeline-dot-live" : "timeline-dot"} />
                    <div className="min-w-0 pb-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[11px] font-semibold text-[#efe6f1]">{step.action.replaceAll("_", " ")}</span>
                        <span className="text-[10px] text-[#958a99]">{time(step.timestamp)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-5 text-[#ada1b2]">{step.result_summary}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>

            <article className="control-card p-5 lg:col-span-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Live payment stream</p>
                  <h2 className="mt-1 text-[17px] font-medium tracking-[-0.03em] text-[#f6eff8]">Recent transactions</h2>
                </div>
                <Network className="size-4 text-[#c8b5d2]" />
              </div>
              <div className="mt-3 divide-y divide-white/[0.07]">
                {transactions.slice(0, 4).map((transaction) => (
                  <div key={transaction.transaction_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={transaction.approved ? "stream-state stream-approved" : "stream-state stream-declined"}>
                        {transaction.approved ? "✓" : "×"}
                      </span>
                      <p className="truncate text-[11px] text-[#ded4e2]">
                        {transaction.country} · {transaction.provider} · {transaction.payment_method}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] font-medium text-[#f2eaf4]">{usd(transaction.amount, 2)}</p>
                      <p className="text-[9px] text-[#948998]">{transaction.latency_ms} ms</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </main>
      </div>

      <aside className="persistent-alert" aria-live="polite">
        <div className="flex gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb9aae]">
            <ShieldCheck className="size-4" />
          </span>
          <div>
            <p className="text-[10px] font-bold tracking-[0.1em] text-[#f9a2b5] uppercase">High · payment anomaly detected</p>
            <p className="mt-1 text-xs font-medium text-[#f5edf6]">Approval is 31.4 pp below its expected range.</p>
            <p className="mt-1 text-[11px] text-[#b8acbb]">1,842 tx/min affected · Investigation started</p>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[#ebbce1] hover:text-white"
              onClick={() => selectIncident("incident-br-novapay")}
            >
              Watch investigation <ChevronRight className="size-3" />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
