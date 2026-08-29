"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApprovalSignalSceneProps, LandingPointer } from "./approval-signal-scene";

const ApprovalSignalScene = dynamic<ApprovalSignalSceneProps>(
  () => import("./approval-signal-scene").then((module) => module.ApprovalSignalScene),
  { ssr: false },
);

type StoryStage = {
  key: "baseline" | "deviation" | "counterfactual" | "evidence";
  eyebrow: string;
  primary: string;
  secondary: string;
  start: number;
  end: number;
};

const stages: StoryStage[] = [
  {
    key: "baseline",
    eyebrow: "Baseline",
    primary: "93.9% expected",
    secondary: "Brazil · card payments",
    start: 0.05,
    end: 0.27,
  },
  {
    key: "deviation",
    eyebrow: "Sustained deviation",
    primary: "62.4% observed",
    secondary: "−31.4 pp below expected range",
    start: 0.32,
    end: 0.53,
  },
  {
    key: "counterfactual",
    eyebrow: "Counterfactual",
    primary: "AuroraPay: 94.1%",
    secondary: "Same traffic and issuer mix remained healthy",
    start: 0.58,
    end: 0.77,
  },
  {
    key: "evidence",
    eyebrow: "Evidence converges",
    primary: "NovaPay × Brazil × Card × Itaú",
    secondary: "do_not_honor: 71% of declines",
    start: 0.82,
    end: 1,
  },
];

const giantWords = [
  { label: "EXPECTED", start: 0, end: 0.3, top: "18%", left: "-4%", direction: -1 },
  { label: "DEVIATION", start: 0.24, end: 0.56, top: "59%", left: "23%", direction: 1 },
  { label: "CONTROL", start: 0.5, end: 0.79, top: "20%", left: "39%", direction: -1 },
  { label: "EVIDENCE", start: 0.76, end: 1.05, top: "61%", left: "-2%", direction: 1 },
];

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function stageVisibility(progress: number, start: number, end: number) {
  const entering = clamp((progress - (start - 0.055)) / 0.1);
  const leaving = end >= 1 ? 1 : clamp((end + 0.04 - progress) / 0.09);
  return Math.min(entering, leaving);
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

function MaskedLine({ children, progress }: { children: React.ReactNode; progress: number }) {
  return (
    <span className="landing-mask-line">
      <span className="landing-mask-inner" style={{ transform: `translate3d(0, ${(1 - progress) * 112}%, 0)` }}>
        {children}
      </span>
    </span>
  );
}

function SignalFallback({ progress }: { progress: number }) {
  const approach = clamp((progress - 0.04) / 0.54);
  const departure = clamp((progress - 0.58) / 0.42);
  const x = 20 - approach * 24 + departure * 14;
  const y = -30 + approach * 38 + departure * 36;
  const scale = (0.68 + approach * 0.47) * (1 - departure * 0.46);
  const phase = progress < 0.31 ? "healthy" : progress < 0.75 ? "deviation" : "evidence";

  return (
    <div className="landing-signal-fallback" aria-hidden="true">
      <div
        className={`landing-signal-fallback-object landing-signal-fallback-${phase}`}
        style={{ transform: `translate3d(${x}vw, ${y}vh, 0) rotate(${18 + progress * 62}deg) scale(${scale})` }}
      >
        <i className="landing-signal-layer landing-signal-layer-one" />
        <i className="landing-signal-layer landing-signal-layer-two" />
        <i className="landing-signal-display-fallback"><small>{progress < 0.3 ? "EXPECTED" : progress < 0.73 ? "OBSERVED" : "CONTROL"}</small><strong>{progress < 0.3 ? "93.9%" : progress < 0.73 ? "62.4%" : "94.1%"}</strong></i>
        <i className="landing-signal-band-fallback" />
        <i className="landing-signal-led-fallback" />
        {progress > 0.79 ? <><i className="landing-signal-fragment landing-signal-fragment-a" /><i className="landing-signal-fragment landing-signal-fragment-b" /><i className="landing-signal-fragment landing-signal-fragment-c" /></> : null}
      </div>
    </div>
  );
}

export function LandingHero() {
  const storyRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const pointerRef = useRef<LandingPointer>({ x: 0, y: 0 });
  const [progress, setProgress] = useState(0);
  const [webglAvailable, setWebglAvailable] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;

    let rawProgress = 0;
    let frame = 0;
    const updateRawProgress = () => {
      const element = storyRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const travel = Math.max(element.offsetHeight - window.innerHeight, 1);
      rawProgress = clamp(-rect.top / travel);
    };
    const tick = () => {
      const next = progressRef.current + (rawProgress - progressRef.current) * 0.08;
      progressRef.current = Math.abs(next - rawProgress) < 0.0002 ? rawProgress : next;
      setProgress(progressRef.current);
      frame = window.requestAnimationFrame(tick);
    };

    updateRawProgress();
    frame = window.requestAnimationFrame(tick);
    window.addEventListener("scroll", updateRawProgress, { passive: true });
    window.addEventListener("resize", updateRawProgress);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateRawProgress);
      window.removeEventListener("resize", updateRawProgress);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = document.createElement("canvas");
    const available = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    const frame = window.requestAnimationFrame(() => setWebglAvailable(available));
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion]);

  useEffect(() => {
    if (!reducedMotion) return;
    const frame = window.requestAnimationFrame(() => {
      setWebglAvailable(false);
      setSceneReady(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const displayProgress = reducedMotion ? 0.58 : progress;
  const introVisibility = reducedMotion ? 1 : clamp((0.2 - progress) / 0.08);
  const canRenderScene = webglAvailable && !reducedMotion;
  const stageVisibilities = useMemo(
    () => new Map(stages.map((stage) => [stage.key, stageVisibility(displayProgress, stage.start, stage.end)])),
    [displayProgress],
  );

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1),
      y: clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1),
    };
  };

  return (
    <section ref={storyRef} className={reducedMotion ? "landing-hero landing-hero-reduced" : "landing-hero"} aria-labelledby="landing-heading">
      <div className="landing-hero-stage" onPointerMove={handlePointerMove} onPointerLeave={() => { pointerRef.current = { x: 0, y: 0 }; }}>
        <nav className="landing-nav" aria-label="Control Tower landing">
          <Link href="/" className="landing-nav-brand" aria-label="Control Tower home">
            <span>CT</span>
            <strong>Control Tower</strong>
          </Link>
          <div className="landing-nav-links">
            <a href="#evidence">Evidence model</a>
            <Link href="/chaos">Chaos Lab</Link>
          </div>
          <Link href="/control-room" className="landing-nav-cta">
            Open control room <ArrowUpRight className="size-3.5" />
          </Link>
        </nav>

        <div className="landing-hero-atmosphere" aria-hidden="true" />

        <div className="landing-giant-type" aria-hidden="true">
          {giantWords.map((word) => {
            const local = clamp((displayProgress - word.start) / (word.end - word.start));
            const visibility = stageVisibility(displayProgress, word.start, word.end);
            const x = (1 - local) * word.direction * 18;
            const y = (1 - local) * 14;
            return (
              <span
                key={word.label}
                style={{
                  top: word.top,
                  left: word.left,
                  clipPath: `inset(0 ${(1 - visibility) * 100}% 0 0)`,
                  transform: `translate3d(${x}%, ${y}%, 0)`,
                }}
              >
                {word.label}
              </span>
            );
          })}
        </div>

        <div className="landing-scene-wrap">
          {canRenderScene ? <ApprovalSignalScene progress={displayProgress} progressRef={progressRef} pointerRef={pointerRef} onReady={onSceneReady} /> : null}
          {!sceneReady ? <SignalFallback progress={displayProgress} /> : null}
        </div>

        <div className="landing-hero-intro">
          <MaskedLine progress={introVisibility}><span className="landing-hero-eyebrow">Control Tower · payment incident intelligence</span></MaskedLine>
          <h1 id="landing-heading">
            <MaskedLine progress={introVisibility}>When approval drops,</MaskedLine>
            <MaskedLine progress={introVisibility}><em>find what changed.</em></MaskedLine>
          </h1>
          <MaskedLine progress={introVisibility}><p>Control Tower turns a payment anomaly into evidence your team can verify.</p></MaskedLine>
          <div className="landing-hero-actions-mask">
            <div className="landing-hero-actions" style={{ transform: `translate3d(0, ${(1 - introVisibility) * 120}%, 0)` }}>
              <Link href="/control-room" className="landing-action landing-action-primary">
                Enter live control room <ArrowUpRight className="size-4" />
              </Link>
              <Link href="/incidents/incident-br-novapay" className="landing-action landing-action-secondary">
                See the investigation <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        {reducedMotion ? (
          <div className="landing-reduced-facts">
            {stages.map((stage) => (
              <div key={stage.key}>
                <span>{stage.eyebrow}</span>
                <strong>{stage.primary}</strong>
                <p>{stage.secondary}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="landing-stage-captions" aria-live="polite">
            {stages.map((stage) => {
              const visibility = stageVisibilities.get(stage.key) ?? 0;
              return (
                <div className={`landing-stage-caption landing-stage-caption-${stage.key}`} key={stage.key}>
                  <MaskedLine progress={visibility}><span>{stage.eyebrow}</span></MaskedLine>
                  <MaskedLine progress={visibility}><strong>{stage.primary}</strong></MaskedLine>
                  <MaskedLine progress={visibility}><p>{stage.secondary}</p></MaskedLine>
                  {stage.key === "evidence" ? <MaskedLine progress={visibility}><small>Probable · human review required</small></MaskedLine> : null}
                </div>
              );
            })}
          </div>
        )}

        {!reducedMotion ? (
          <div className="landing-scroll-cue" aria-hidden="true">
            <span>Scroll to investigate</span>
            <ArrowDown className="size-3.5" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
