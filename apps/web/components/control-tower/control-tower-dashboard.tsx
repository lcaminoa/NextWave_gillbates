"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Activity, ChevronRight, Clock3, Gauge, Globe2, MonitorUp, Network, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import RotatingEarth, { type GlobeHotspot } from "@/components/ui/wireframe-dotted-globe";
import { useIncidentDetail, useIncidentReports, useTransactionStream } from "@/lib/api/use-control-tower";
import { integer, percent, time, usd } from "@/lib/format";

const countryCoordinates: Record<string, Pick<GlobeHotspot, "latitude" | "longitude" | "country" | "countryCode">> = {
  AR: { country: "Argentina", countryCode: "AR", latitude: -38.4161, longitude: -63.6167 },
  BR: { country: "Brazil", countryCode: "BR", latitude: -14.235, longitude: -51.9253 },
  CO: { country: "Colombia", countryCode: "CO", latitude: 4.5709, longitude: -74.2973 },
  MX: { country: "Mexico", countryCode: "MX", latitude: 23.6345, longitude: -102.5528 },
};

export function ControlTowerDashboard() {
  const { reports, status: reportsStatus, error: reportsError } = useIncidentReports();
  const { transactions, status: streamStatus } = useTransactionStream();
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);

  const selectedReport = reports.find((report) => report.incident_id === selectedIncidentId) ?? null;
  const activeReport = selectedReport ?? reports[0] ?? null;
  const { detail: selectedDetail } = useIncidentDetail(activeReport?.incident_id ?? null);
  const selectedCandidate = selectedDetail?.candidates.find((candidate) => candidate.candidate_id === activeReport?.winning_candidate_id) ?? selectedDetail?.candidates[0];
  const selectedEvidence = selectedDetail?.evidence.find((item) => activeReport?.claims.flatMap((claim) => claim.evidence_ids).includes(item.evidence_id));
  const approvalRate = transactions.length ? transactions.filter((transaction) => transaction.approved).length / transactions.length : null;

  const globeHotspots: GlobeHotspot[] = reports.flatMap((report) => {
    const country = report.incident_id === activeReport?.incident_id ? selectedCandidate?.dimensions.country : undefined;
    const coordinates = country ? countryCoordinates[country] : undefined;
    if (!coordinates) return [];
    return [{ ...coordinates, incidentId: report.incident_id, label: `${coordinates.country} · ${report.status} report`, severity: report.status === "inconclusive" ? "medium" : "high" }];
  });
  const selectedHotspot = globeHotspots.find((hotspot) => hotspot.incidentId === activeReport?.incident_id);
  const selectHotspot = useCallback((hotspot: GlobeHotspot) => setSelectedIncidentId(hotspot.incidentId), []);
  const atRisk = reports.reduce((total, report) => total + report.estimated_revenue_loss_usd_per_hour, 0);

  return (
    <div className={presentationMode ? "control-canvas presentation-mode" : "control-canvas"}>
      <div className="control-shell"><main className="control-main">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><span className="live-pill"><Radio className={streamStatus === "live" ? "size-3 animate-pulse" : "size-3"} /> {streamStatus === "live" ? "LIVE" : streamStatus === "loading" ? "CONNECTING" : "STREAM OFFLINE"}</span><span className="text-[11px] text-[#a69baa]">{reportsStatus === "live" ? "Runtime reports connected" : reportsStatus === "loading" ? "Loading runtime" : "Runtime unavailable"}</span></div>
            <h1 className="mt-3 text-[31px] font-medium tracking-[-0.05em] text-[#fbf7fc]">Payment health, <span className="text-[#dca6dd]">with evidence.</span></h1>
            <p className="mt-1 text-[13px] text-[#a89fad]">Live transaction stream and active investigations from Control Tower.</p>
          </div>
          <Button variant="ghost" size="sm" className="rounded-full border border-white/10 bg-black/25 px-3 text-[#bcb2c2] hover:bg-white/[0.07] hover:text-white" onClick={() => setPresentationMode((value) => !value)}><MonitorUp className="size-3.5" />{presentationMode ? "Exit presentation" : "Presentation mode"}</Button>
        </header>

        {reportsStatus === "unavailable" ? <div className="mt-4 rounded-xl border border-[#fb7185]/20 bg-[#fb7185]/[0.07] p-4 text-sm text-[#f4c5ce]">Control Tower API is unavailable. Set <code>NEXT_PUBLIC_CONTROL_TOWER_API_ORIGIN</code> and start the engine. {reportsError}</div> : null}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4"><div className="segmented-control" aria-label="Dashboard view"><button type="button" className="segmented-active">Overview</button><Link href="/investigations" className="px-3 py-1.5 text-[11px] text-[#bcb0c0]">Research lane</Link><Link href="/chaos" className="px-3 py-1.5 text-[11px] text-[#bcb0c0]">Chaos lab</Link></div><div className="flex items-center gap-2 text-[11px] text-[#a79dab]"><Clock3 className="size-3.5" />Transactions retained in browser: {transactions.length}</div></div>

        <section className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-12">
          <div className="grid gap-3 md:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
            <article className="control-card metric-card"><div className="flex items-start justify-between"><div><p className="eyebrow">Observed approval rate</p><p className="metric-value text-[#f6d0e9]">{approvalRate === null ? "—" : percent(approvalRate)}</p></div><span className="metric-icon metric-icon-alert"><Gauge className="size-4" /></span></div><p className="mt-3 text-xs text-[#bdafc3]">{transactions.length ? `${integer(transactions.length)} streamed transactions in this browser session.` : "Waiting for the transaction stream."}</p></article>
            <article className="control-card metric-card relative overflow-hidden"><div className="relative z-10"><div className="flex items-start justify-between"><div><p className="eyebrow">Research status</p><p className="mt-2 text-[17px] font-medium tracking-[-0.03em] text-[#f6eff8]">{reports.length ? `${reports.length} active report${reports.length === 1 ? "" : "s"}` : "Awaiting incident report"}</p></div><Sparkles className="size-4 text-[#dca6dd]" /></div><p className="mt-2 max-w-[250px] text-xs leading-5 text-[#b8adbd]">Every recommendation remains an operator decision; the runtime never reroutes traffic.</p>{selectedReport ? <Link href={`/incidents/${selectedReport.incident_id}`} className="premium-action mt-4 inline-flex">Open investigation <ChevronRight className="size-3.5" /></Link> : null}</div><div className="absolute -bottom-16 -right-12 size-44 rounded-full bg-[#b866c4]/15 blur-3xl" /></article>
          </div>
          <article className="control-card min-h-[318px] p-5 xl:col-span-8"><div className="flex items-start justify-between"><div><p className="eyebrow">Active investigations</p><h2 className="mt-1 text-[17px] font-medium tracking-[-0.03em] text-[#f5eef7]">Prioritized by impact</h2></div><span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-medium text-[#c9bdce]">{reports.length} active</span></div><div className="mt-4 space-y-2">{reports.length ? reports.map((report) => <button key={report.incident_id} type="button" onClick={() => setSelectedIncidentId(report.incident_id)} className={report.incident_id === selectedIncidentId ? "incident-list-item incident-list-item-selected" : "incident-list-item"}><div className="flex items-center justify-between gap-2"><span className="severity-badge border-[#dca6dd]/30 bg-[#dca6dd]/10 text-[#efc4ef]">LIVE REPORT</span><span className={report.status === "inconclusive" ? "status-uncertain" : "status-probable"}>{report.status === "inconclusive" ? "Evidence insufficient" : "Evidence recorded"}</span></div><p className="mt-2 truncate text-left text-[13px] font-medium text-[#f5edf7]">{report.summary}</p><div className="mt-1.5 flex items-center justify-between text-[11px] text-[#aaa0af]"><span>{time(report.generated_at)}</span><span>{usd(report.estimated_revenue_loss_usd_per_hour)}/hour</span></div></button>) : <p className="py-12 text-center text-sm text-[#aaa0af]">No report available yet.</p>}</div></article>
        </section>

        <section className="globe-stage control-card mt-3 overflow-hidden"><div className="relative z-10 flex flex-wrap items-start justify-between gap-4 p-5 md:p-6"><div><p className="eyebrow">Impact geography</p><h2 className="mt-1 text-[22px] font-medium tracking-[-0.04em] text-[#f7f0f8]">Incidents, <span className="text-[#dca6dd]">located.</span></h2><p className="mt-1 text-xs text-[#aea2b4]">Markers are rendered only when the selected live candidate carries a supported country code.</p></div><Globe2 className="mt-1 size-4 text-[#c8b4d0]" /></div>{globeHotspots.length ? <><RotatingEarth height={430} className="globe-hero" hotspots={globeHotspots} selectedCountryCode={selectedHotspot?.countryCode} onHotspotSelect={selectHotspot} /><aside className="globe-detail-card" aria-live="polite"><p className="eyebrow">Selected location</p><h3 className="mt-1 text-lg font-medium tracking-[-0.035em] text-[#f9f2fa]">{selectedHotspot?.country ?? "No supported location"}</h3><p className="mt-3 text-xs leading-5 text-[#c9bdce]">{selectedReport?.summary}</p><dl className="globe-facts"><div><dt>Candidate confidence</dt><dd>{selectedCandidate ? percent(selectedCandidate.confidence) : "—"}</dd></div><div><dt>Affected count</dt><dd>{selectedCandidate ? integer(selectedCandidate.affected_count) : "—"}</dd></div><div><dt>Business impact</dt><dd>{selectedReport ? `${usd(selectedReport.estimated_revenue_loss_usd_per_hour)}/hr` : "—"}</dd></div></dl><p className="mt-3 border-t border-white/8 pt-3 text-[11px] leading-4 text-[#afa4b4]">{selectedEvidence?.summary ?? "No evidence citation is available yet."}</p></aside></> : <div className="p-6 text-sm text-[#aaa0af]">No country-backed candidate is available to map yet.</div>}</section>

        <section className="control-card mt-3 flex min-h-[220px] flex-col overflow-hidden p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Live approval performance</p><h2 className="mt-1 text-[18px] font-medium tracking-[-0.035em] text-[#f6eff8]">Observed stream, no fabricated baseline</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-[#aaa0af]">The stream supplies approval outcomes. The API does not yet supply baseline points or anomaly intervals to the UI, so the baseline chart is intentionally withheld.</p></div><Activity className="size-4 text-[#c8b5d2]" /></div><div className="mt-7 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/[0.08] bg-black/[0.12] p-4"><p className="eyebrow">Observed approval</p><strong className="mt-2 block text-2xl text-[#f6d0e9]">{approvalRate === null ? "—" : percent(approvalRate)}</strong></div><div className="rounded-xl border border-white/[0.08] bg-black/[0.12] p-4"><p className="eyebrow">Stream state</p><strong className="mt-2 block text-2xl text-[#f6d0e9]">{streamStatus}</strong></div><div className="rounded-xl border border-white/[0.08] bg-black/[0.12] p-4"><p className="eyebrow">Reported risk</p><strong className="mt-2 block text-2xl text-[#f6d0e9]">{usd(atRisk)}/hr</strong></div></div></section>

        <section className="mt-3 grid gap-3 lg:grid-cols-12"><article className="control-card p-5 lg:col-span-7"><div className="flex items-center justify-between"><div><p className="eyebrow">Research lane</p><h2 className="mt-1 text-[17px] font-medium tracking-[-0.03em] text-[#f6eff8]">Observable investigation steps</h2></div><Activity className="size-4 text-[#c8b5d2]" /></div><ol className="mt-4 space-y-3">{selectedDetail?.investigation_steps.slice(0, 3).map((step, index, steps) => <li key={step.step_id} className="relative flex gap-3">{index !== steps.length - 1 ? <span className="absolute left-[7px] top-5 h-6 border-l border-dashed border-white/15" /> : null}<span className={index === steps.length - 1 ? "timeline-dot timeline-dot-live" : "timeline-dot"} /><div className="min-w-0 pb-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-[11px] font-semibold text-[#efe6f1]">{step.action.replaceAll("_", " ")}</span><span className="text-[10px] text-[#958a99]">{time(step.timestamp)}</span></div><p className="mt-0.5 text-[11px] leading-5 text-[#ada1b2]">{step.result_summary}</p></div></li>) ?? <li className="text-sm text-[#aaa0af]">Select an incident with recorded investigation steps.</li>}</ol></article><article className="control-card p-5 lg:col-span-5"><div className="flex items-center justify-between"><div><p className="eyebrow">Live payment stream</p><h2 className="mt-1 text-[17px] font-medium tracking-[-0.03em] text-[#f6eff8]">Recent transactions</h2></div><Network className="size-4 text-[#c8b5d2]" /></div><div className="mt-3 divide-y divide-white/[0.07]">{transactions.slice(0, 4).map((transaction) => <div key={transaction.transaction_id} className="flex items-center justify-between gap-3 py-2.5"><div className="flex min-w-0 items-center gap-2"><span className={transaction.approved ? "stream-state stream-approved" : "stream-state stream-declined"}>{transaction.approved ? "✓" : "×"}</span><p className="truncate text-[11px] text-[#ded4e2]">{transaction.country} · {transaction.provider} · {transaction.payment_method}</p></div><div className="shrink-0 text-right"><p className="text-[11px] font-medium text-[#f2eaf4]">{usd(transaction.amount, 2)}</p><p className="text-[9px] text-[#948998]">{transaction.latency_ms} ms</p></div></div>)}{!transactions.length ? <p className="py-8 text-center text-sm text-[#aaa0af]">Waiting for streamed transactions.</p> : null}</div></article></section>
      </main></div>
      {selectedReport ? <aside className="persistent-alert" aria-live="polite"><div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb9aae]"><ShieldCheck className="size-4" /></span><div><p className="text-[10px] font-bold tracking-[0.1em] text-[#f9a2b5] uppercase">Active payment investigation</p><p className="mt-1 text-xs font-medium text-[#f1e8f2]">{selectedReport.summary}</p><Link href={`/incidents/${selectedReport.incident_id}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#e7b9e5]">Review evidence <ChevronRight className="size-3" /></Link></div></div></aside> : null}
    </div>
  );
}
