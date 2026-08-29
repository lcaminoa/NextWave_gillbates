"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  Bell,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crosshair,
  Gauge,
  Globe2,
  LayoutDashboard,
  MonitorUp,
  Network,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApprovalChart } from "@/components/control-tower/approval-chart";
import RotatingEarth, { type GlobeHotspot } from "@/components/ui/wireframe-dotted-globe";
import { anomalies, candidates, investigationSteps, reports, transactions } from "@/lib/fixtures/control-tower";
import { deltaPp, time, usd } from "@/lib/format";
import type { Dimensions } from "@/lib/contracts";

const navigation = [
  { label: "Control Tower", href: "/", icon: LayoutDashboard, active: true },
  { label: "Investigations", href: "/incidents/incident-br-novapay", icon: Crosshair },
  { label: "Chaos Console", href: "/chaos", icon: Zap },
];

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const selectedReport = reports.find((report) => report.incident_id === selectedIncidentId) ?? reports[0];
  const selectedCandidate = candidates.find((candidate) => candidate.candidate_id === selectedReport.winning_candidate_id);
  const [selectedCountry, setSelectedCountry] = useState(selectedCandidate?.dimensions.country ?? "BR");

  const globeHotspots = useMemo<GlobeHotspot[]>(
    () => [
      {
        country: "Brazil",
        countryCode: "BR",
        longitude: -51.9253,
        latitude: -14.235,
        label: "Brazil · NovaPay card · −31.4 pp",
        severity: "high",
      },
      {
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

  const selectIncident = (incidentId: string) => {
    const report = reports.find((item) => item.incident_id === incidentId);
    const candidate = candidates.find((item) => item.candidate_id === report?.winning_candidate_id);
    setSelectedIncidentId(incidentId);
    if (candidate?.dimensions.country) setSelectedCountry(candidate.dimensions.country);
  };

  return (
    <div className={presentationMode ? "control-canvas presentation-mode" : "control-canvas"}>
      <div className="control-shell">
        <aside className="control-sidebar">
          <div>
            <Link href="/" className="flex items-center gap-2.5 px-2.5 pt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#f9f5fa]">
              <span className="grid size-7 place-items-center rounded-[9px] border border-white/15 bg-white/[0.06] text-[10px] font-bold tracking-[0.18em]">
                CT
              </span>
              CONTROL TOWER
            </Link>
            <p className="mt-2 px-2.5 text-[10px] font-medium tracking-[0.13em] text-[#93899b] uppercase">Payment research</p>
          </div>

          <nav className="mt-10 space-y-1" aria-label="Main navigation">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={
                    item.active
                      ? "nav-item nav-item-active"
                      : "nav-item"
                  }
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-1">
            <button className="nav-item w-full" type="button">
              <Settings2 className="size-4" />
              Preferences
            </button>
            <button className="nav-item w-full" type="button">
              <CircleHelp className="size-4" />
              Demo guide
            </button>
          </div>
        </aside>

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
              <div className="relative">
                <Button
                  aria-label="Open notification center"
                  variant="ghost"
                  size="icon"
                  className="relative rounded-full border border-white/10 bg-black/30 text-[#f2eaf3] hover:bg-white/[0.08]"
                  onClick={() => setNotificationsOpen((value) => !value)}
                >
                  <Bell className="size-4" />
                  <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#fb7185]" />
                </Button>
                {notificationsOpen ? (
                  <div className="notification-popover">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#f6f0f7]">Notifications</p>
                      <span className="text-[10px] font-semibold text-[#f8a3b5]">2 unread</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-[#fb7185]/20 bg-[#fb7185]/[0.07] p-3">
                        <p className="text-[11px] font-semibold text-[#f8b1c0]">HIGH · investigation started</p>
                        <p className="mt-1 text-xs leading-5 text-[#d6cad9]">Approval is 31.4 pp below the expected range in Brazil.</p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                        <p className="text-[11px] font-semibold text-[#c6b4cf]">EVIDENCE UPDATE</p>
                        <p className="mt-1 text-xs leading-5 text-[#d6cad9]">Provider control remains healthy. Human review required.</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <Button aria-label="Open settings" variant="ghost" size="icon" className="rounded-full border border-white/10 bg-black/30 text-[#f2eaf3] hover:bg-white/[0.08]">
                <Settings2 className="size-4" />
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

            <article className="control-card min-h-[318px] p-5 xl:col-span-4">
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

            <article className="control-card relative min-h-[318px] overflow-hidden p-5 xl:col-span-4">
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <p className="eyebrow">Impact geography</p>
                  <h2 className="mt-1 text-[17px] font-medium tracking-[-0.03em] text-[#f5eef7]">Global payment footprint</h2>
                </div>
                <Globe2 className="size-4 text-[#c8b4d0]" />
              </div>
              <RotatingEarth
                height={234}
                className="-mx-3 -mt-1"
                hotspots={globeHotspots}
                selectedCountryCode={selectedCountry}
                onHotspotSelect={(hotspot) => setSelectedCountry(hotspot.countryCode)}
              />
              <div className="absolute bottom-4 left-5 right-5 z-10 flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#171119]/80 px-3 py-2 backdrop-blur">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-[#f7edf8]">{selectedHotspot.country}</p>
                  <p className="truncate text-[10px] text-[#a99eaf]">{selectedHotspot.label}</p>
                </div>
                <span className={"severity-badge shrink-0 " + severityStyles[selectedHotspot.severity]}>
                  {selectedHotspot.severity}
                </span>
              </div>
            </article>
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
