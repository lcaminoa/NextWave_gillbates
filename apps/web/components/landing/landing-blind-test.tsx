"use client";

import Link from "next/link";
import { ArrowUpRight, Check, EyeOff, Lock } from "lucide-react";
import { useIncidentReports } from "@/lib/api/use-control-tower";
import { usd } from "@/lib/format";

/**
 * The blind test is the strongest claim PHAROS can make, so it is presented the
 * way the product presents everything else: as a recorded result you can check,
 * next to the control that lets you reproduce it. Nothing here is asserted as
 * live — the run below happened, once, and is labelled with when.
 */

const RECORDED_RUN = {
  date: "30 Aug 2026",
  chaosId: "chaos_8166f08054",
  incidentId: "inc_anom_7bc545b7",
  injected: "merchant = VuelaYa",
  severity: "−25 pp",
  found: "merchant = VuelaYa",
  status: "Probable · human review required",
  minutesToReport: "3 min 32 s",
  windows: "3 sustained windows",
};

/** Reads the same endpoint the product does. If it is down, it says so. */
function RuntimeTile() {
  const { reports, status } = useIncidentReports(15_000);
  const atRisk = reports.reduce((total, report) => total + report.estimated_revenue_loss_usd_per_hour, 0);

  if (status === "unavailable") {
    return (
      <div className="landing-live-tile landing-live-tile-down">
        <span>Runtime</span>
        <strong>Unavailable</strong>
        <p>The engine is not answering right now. This panel shows nothing rather than something invented.</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="landing-live-tile">
        <span>Runtime</span>
        <strong>Connecting…</strong>
        <p>Reading the live investigation queue.</p>
      </div>
    );
  }

  return (
    <div className="landing-live-tile landing-live-tile-up">
      <span>Live right now</span>
      <strong>
        {reports.length} open {reports.length === 1 ? "investigation" : "investigations"}
      </strong>
      <p>
        {reports.length
          ? `${usd(atRisk)}/hour reported at risk across the open reports.`
          : "No anomaly has been sustained long enough to open one. This is what a healthy stream looks like."}
      </p>
    </div>
  );
}

export function LandingBlindTest() {
  return (
    <section className="landing-blind-section" id="blind-test" aria-labelledby="blind-heading">
      <header className="landing-section-intro">
        <span>Trial by fire / 03</span>
        <h2 id="blind-heading">We don&apos;t know the answer either.</h2>
        <p>
          A scenario is injected with its dimensions sealed from the investigator and from this interface.
          The detector only ever sees the payment stream. Here is one recorded run — and the console that
          lets you set up your own.
        </p>
      </header>

      <div className="landing-blind-grid">
        <article className="landing-blind-card">
          <div className="landing-blind-head">
            <span className="landing-blind-chip">
              <Lock className="size-3" aria-hidden="true" /> Recorded run · {RECORDED_RUN.date}
            </span>
            <code>{RECORDED_RUN.chaosId}</code>
          </div>

          <div className="landing-blind-compare">
            <div className="landing-blind-col">
              <p className="landing-blind-label">
                <EyeOff className="size-3.5" aria-hidden="true" /> Ground truth injected
              </p>
              <strong>{RECORDED_RUN.injected}</strong>
              <span>{RECORDED_RUN.severity} degradation · sealed until reveal</span>
            </div>

            <div className="landing-blind-arrow" aria-hidden="true" />

            <div className="landing-blind-col landing-blind-col-found">
              <p className="landing-blind-label">
                <Check className="size-3.5" aria-hidden="true" /> What the system reported
              </p>
              <strong>{RECORDED_RUN.found}</strong>
              <span>{RECORDED_RUN.status}</span>
            </div>
          </div>

          <dl className="landing-blind-facts">
            <div>
              <dt>Time to report</dt>
              <dd>{RECORDED_RUN.minutesToReport}</dd>
            </div>
            <div>
              <dt>Confirmed after</dt>
              <dd>{RECORDED_RUN.windows}</dd>
            </div>
            <div>
              <dt>Incident</dt>
              <dd><code>{RECORDED_RUN.incidentId}</code></dd>
            </div>
          </dl>

          {/* The contract exposes no link between a chaos run and an incident, so the
              match is left for a person to read rather than asserted by the page. */}
          <p className="landing-blind-note">
            PHAROS does not claim this match automatically — no field ties a chaos run to an incident.
            The two columns are printed side by side so a person makes the call.
          </p>
        </article>

        <aside className="landing-blind-aside">
          <RuntimeTile />
          <Link href="/chaos" className="landing-action landing-action-primary">
            Run your own blind test <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <p>
            Pick a severity, inject, and watch the queue. The dimensions stay sealed until you press
            reveal — including from us.
          </p>
        </aside>
      </div>
    </section>
  );
}
