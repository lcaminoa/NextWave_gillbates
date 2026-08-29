"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, FlaskConical, LoaderCircle, ShieldAlert, Sparkles } from "lucide-react";
import type { ChaosSpec } from "@/lib/contracts";

type ChaosMode = "manual" | "random_unknown";
type ConsoleState = "ready" | "injecting" | "running" | "reveal-pending";

export function ChaosConsole() {
  const [mode, setMode] = useState<ChaosMode>("manual");
  const [severity, setSeverity] = useState(-25);
  const [duration, setDuration] = useState(20);
  const [state, setState] = useState<ConsoleState>("ready");
  const [lastSpec, setLastSpec] = useState<ChaosSpec | null>(null);

  const inject = async () => {
    setState("injecting");
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    const spec: ChaosSpec = {
      chaos_id: "chaos-demo-001",
      mode,
      dimensions:
        mode === "manual"
          ? {
              provider: "NovaPay",
              country: "BR",
              payment_method: "card",
              issuing_bank: "Itaú",
              canonical_decline_code: "do_not_honor",
            }
          : undefined,
      severity_pp: severity,
      started_at: new Date().toISOString(),
      duration_minutes: duration,
      revealed: false,
    };
    setLastSpec(spec);
    setState("running");
  };

  const requestReveal = async () => {
    setState("reveal-pending");
  };

  return (
    <div className="control-canvas">
      <main className="mx-auto max-w-[1160px]">
        <header>
          <Link href="/" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#b9acbe] hover:text-white">
            <ArrowLeft className="size-3.5" /> Control Tower
          </Link>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="live-pill"><FlaskConical className="size-3" /> JUDGE CONSOLE</span>
                <span className="text-[11px] text-[#a89eab]">No payment traffic is modified outside the simulator.</span>
              </div>
              <h1 className="mt-3 text-[34px] font-medium tracking-[-0.055em] text-[#fbf7fc]">Chaos, with a clean reveal.</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#b7aab9]">
                Inject a controlled payment anomaly. In random mode, ground truth stays outside the client until the backend reveal.
              </p>
            </div>
            {state === "running" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-[#fb7185]/25 bg-[#fb7185]/[0.08] px-3 py-2 text-[11px] font-semibold text-[#f9a8b8]">
                <LoaderCircle className="size-3.5 animate-spin" /> Incident injection active
              </span>
            ) : null}
          </div>
        </header>

        <section className="mt-8 grid gap-3 lg:grid-cols-12">
          <article className="control-card p-6 lg:col-span-7">
            <p className="eyebrow">Inject anomaly</p>
            <div className="mt-4 inline-flex rounded-full border border-white/10 bg-black/25 p-1">
              <button
                type="button"
                onClick={() => { setMode("manual"); setState("ready"); }}
                className={mode === "manual" ? "rounded-full bg-[#a967ad]/40 px-4 py-2 text-xs font-medium text-white" : "rounded-full px-4 py-2 text-xs text-[#b3a7b7]"}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => { setMode("random_unknown"); setState("ready"); }}
                className={mode === "random_unknown" ? "rounded-full bg-[#a967ad]/40 px-4 py-2 text-xs font-medium text-white" : "rounded-full px-4 py-2 text-xs text-[#b3a7b7]"}
              >
                Random unknown
              </button>
            </div>

            {mode === "manual" ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  ["Provider", "NovaPay"],
                  ["Country", "Brazil"],
                  ["Payment method", "Card"],
                  ["Issuing bank", "Itaú"],
                  ["Decline code", "do_not_honor"],
                ].map(([label, value]) => (
                  <label key={label} className="rounded-xl border border-white/[0.09] bg-black/15 p-3">
                    <span className="eyebrow">{label}</span>
                    <span className="mt-2 block text-sm text-[#f2ebf4]">{value}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-[#a78bfa]/25 bg-[#a78bfa]/[0.06] p-5">
                <div className="flex gap-3">
                  <EyeOff className="mt-0.5 size-5 shrink-0 text-[#c4b5fd]" />
                  <div>
                    <p className="text-sm font-semibold text-[#e3dcff]">Blind incident injection</p>
                    <p className="mt-1.5 text-xs leading-5 text-[#c5bdd7]">
                      Ground truth remains hidden from the investigator and this UI. No country, provider, bank or decline code is rendered before the backend returns a reveal.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="rounded-xl border border-white/[0.09] bg-black/15 p-3">
                <span className="eyebrow">Severity</span>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    aria-label="Chaos severity in percentage points"
                    type="range"
                    min="-50"
                    max="-5"
                    value={severity}
                    onChange={(event) => setSeverity(Number(event.target.value))}
                    className="w-full accent-[#dc9bd8]"
                  />
                  <span className="w-12 text-right text-sm font-semibold text-[#f2eaf3]">{severity} pp</span>
                </div>
              </label>
              <label className="rounded-xl border border-white/[0.09] bg-black/15 p-3">
                <span className="eyebrow">Duration</span>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    aria-label="Chaos duration in minutes"
                    type="range"
                    min="5"
                    max="60"
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    className="w-full accent-[#dc9bd8]"
                  />
                  <span className="w-12 text-right text-sm font-semibold text-[#f2eaf3]">{duration} min</span>
                </div>
              </label>
            </div>

            <button
              type="button"
              onClick={inject}
              disabled={state === "injecting"}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#df9ed9] px-4 text-xs font-semibold text-[#291529] transition hover:bg-[#efb5e8] disabled:opacity-60"
            >
              {state === "injecting" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {state === "injecting" ? "Injecting controlled anomaly…" : "Inject controlled anomaly"}
            </button>
          </article>

          <article className="control-card p-6 lg:col-span-5">
            <p className="eyebrow">Integrity status</p>
            {state === "ready" || state === "injecting" ? (
              <div className="mt-6 rounded-2xl border border-white/[0.08] bg-black/15 p-5 text-center">
                <ShieldAlert className="mx-auto size-7 text-[#c3b5c9]" />
                <p className="mt-3 text-sm font-semibold text-[#eee6f0]">Ready for a blind test</p>
                <p className="mt-1.5 text-xs leading-5 text-[#aaa0af]">The control room will only respond to transactions and incident evidence.</p>
              </div>
            ) : null}
            {state === "running" && lastSpec ? (
              <div className="mt-6 rounded-2xl border border-[#fb7185]/25 bg-[#fb7185]/[0.06] p-5">
                <p className="text-sm font-semibold text-[#f5edf6]">
                  {lastSpec.mode === "random_unknown" ? "Blind incident injected" : "Manual incident injected"}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#c9bbc9]">
                  Severity {lastSpec.severity_pp} pp · duration {lastSpec.duration_minutes} minutes
                </p>
                {lastSpec.mode === "random_unknown" ? (
                  <button type="button" onClick={requestReveal} className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#d7b3f7] hover:text-white">
                    <Eye className="size-3.5" /> Request backend reveal
                  </button>
                ) : (
                  <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/15 p-3 text-xs text-[#d8ccd9]">
                    Ground truth: NovaPay · Brazil · Card · Itaú
                  </div>
                )}
              </div>
            ) : null}
            {state === "reveal-pending" ? (
              <div className="mt-6 rounded-2xl border border-[#a78bfa]/25 bg-[#a78bfa]/[0.06] p-5">
                <p className="text-sm font-semibold text-[#e3dcff]">Reveal requires the backend</p>
                <p className="mt-2 text-xs leading-5 text-[#c8bfd8]">
                  The fixture intentionally has no hidden dimensions. When POST /api/chaos/reveal is connected, this panel will compare returned ground truth with the system finding dimension by dimension.
                </p>
              </div>
            ) : null}
          </article>
        </section>
      </main>
    </div>
  );
}
