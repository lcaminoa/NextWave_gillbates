"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import type { ApprovalSignalSceneProps, LandingPointer } from "./approval-signal-scene";
import { IncidentTrajectory } from "./incident-trajectory";
import {
  clamp,
  getActiveCheckpointIndex,
  getCheckpointVisibility,
  getSignalWaypoint,
  getTrajectoryTone,
  landingCheckpoints,
} from "./landing-story";

const ApprovalSignalScene = dynamic<ApprovalSignalSceneProps>(
  () => import("./approval-signal-scene").then((module) => module.ApprovalSignalScene),
  { ssr: false },
);

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
  const waypoint = getSignalWaypoint(progress);
  const tone = getTrajectoryTone(progress);
  const finalUnseal = clamp((progress - 0.958) / 0.042);
  const x = (waypoint.x - 0.5) * 100;
  const y = (waypoint.y - 0.5) * 100;

  return (
    <div className="landing-signal-fallback" aria-hidden="true">
      <div
        className={`landing-payment-card-fallback landing-payment-card-fallback-${tone}`}
        style={{
          transform: `translate3d(${x}vw, ${y}vh, 0) rotateX(${7 + progress * 9}deg) rotateY(${-13 + progress * 12}deg) rotateZ(${-5 + progress * 11}deg) scale(${waypoint.scale})`,
          "--card-unseal": finalUnseal,
        } as CSSProperties}
      >
        <i className="landing-payment-card-edge" />
        <i className="landing-payment-card-face" />
        <i className="landing-payment-card-marking" />
        <i className="landing-payment-card-chip" />
        {finalUnseal > 0.01 ? (
          <>
            <i className="landing-payment-card-evidence-layer landing-payment-card-evidence-layer-a" />
            <i className="landing-payment-card-evidence-layer landing-payment-card-evidence-layer-b" />
          </>
        ) : null}
      </div>
    </div>
  );
}

export function LandingHero() {
  const storyRef = useRef<HTMLElement>(null);
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
  const introVisibility = reducedMotion ? 1 : clamp((0.12 - displayProgress) / 0.035);
  const activeCheckpointIndex = reducedMotion ? -1 : getActiveCheckpointIndex(displayProgress);
  const activeCheckpoint = activeCheckpointIndex >= 0 ? landingCheckpoints[activeCheckpointIndex] : undefined;
  const activeVisibility = activeCheckpoint ? getCheckpointVisibility(displayProgress, activeCheckpoint) : 0;
  const activeReveal = activeCheckpoint ? clamp((displayProgress - activeCheckpoint.start) / 0.02) : 0;
  const canRenderScene = webglAvailable && !reducedMotion;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
      y: clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
    };
  };

  return (
    <section ref={storyRef} className={reducedMotion ? "landing-hero landing-hero-reduced" : "landing-hero"} aria-labelledby="landing-heading">
      <div
        className="landing-hero-stage"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          pointerRef.current = { x: 0, y: 0 };
        }}
      >
        <nav className="landing-nav" aria-label="PHAROS landing">
          <Link href="/" className="landing-nav-brand" aria-label="PHAROS home">
            <strong>PHAROS</strong>
            <span>Payment Incident Intelligence</span>
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
        {!reducedMotion ? (
          <div className="landing-stage-watermark" aria-hidden="true">
            <span>{activeCheckpoint ? `0${activeCheckpoint.id}` : "PHAROS"}</span>
          </div>
        ) : null}

        <div className="landing-scene-wrap">
          {canRenderScene ? <ApprovalSignalScene progressRef={progressRef} pointerRef={pointerRef} onReady={onSceneReady} /> : null}
          {!sceneReady ? <SignalFallback progress={displayProgress} /> : null}
        </div>

        {!reducedMotion ? <IncidentTrajectory progress={displayProgress} /> : null}

        <div
          className="landing-hero-intro"
          aria-hidden={introVisibility < 0.02}
          style={{
            opacity: introVisibility,
            pointerEvents: introVisibility > 0.02 ? "auto" : "none",
            transform: `translate3d(0, ${(1 - introVisibility) * -22}px, 0)`,
            visibility: introVisibility > 0.02 ? "visible" : "hidden",
          }}
        >
          <MaskedLine progress={introVisibility}>
            <span className="landing-hero-eyebrow">PHAROS · Payment Incident Intelligence</span>
          </MaskedLine>
          <h1 id="landing-heading">
            <MaskedLine progress={introVisibility}>When approval drops,</MaskedLine>
            <MaskedLine progress={introVisibility}>
              <em>find what changed.</em>
            </MaskedLine>
          </h1>
          <MaskedLine progress={introVisibility}>
            <p>PHAROS turns a payment anomaly into evidence your team can verify.</p>
          </MaskedLine>
          <div className="landing-hero-actions-mask">
            <div className="landing-hero-actions" style={{ transform: `translate3d(0, ${(1 - introVisibility) * 120}%, 0)` }}>
              <Link href="/control-room" className="landing-action landing-action-primary">
                Enter live control room <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        {reducedMotion ? (
          <div className="landing-reduced-facts">
            {landingCheckpoints.map((checkpoint) => (
              <div key={checkpoint.key}>
                <span>{checkpoint.eyebrow}</span>
                <strong>{checkpoint.primary}</strong>
                <p>{checkpoint.secondary}</p>
              </div>
            ))}
          </div>
        ) : activeCheckpoint ? (
          <div
            className={`landing-checkpoint-caption landing-checkpoint-caption-${activeCheckpoint.side} landing-checkpoint-caption-${activeCheckpoint.key}`}
            aria-live="polite"
            style={{
              opacity: activeVisibility,
              transform: `translate3d(${activeCheckpoint.side === "left" ? -8 : 8}px, ${(1 - activeVisibility) * 14}px, 0)`,
              visibility: activeVisibility > 0.02 ? "visible" : "hidden",
            }}
          >
            <MaskedLine progress={activeReveal}>
              <span className="landing-checkpoint-eyebrow">{activeCheckpoint.eyebrow}</span>
            </MaskedLine>
            <MaskedLine progress={activeReveal}>
              <strong>{activeCheckpoint.primary}</strong>
            </MaskedLine>
            <MaskedLine progress={activeReveal}>
              <p>{activeCheckpoint.secondary}</p>
            </MaskedLine>
          </div>
        ) : null}

        {!reducedMotion && introVisibility > 0.02 ? (
          <div className="landing-scroll-cue" aria-hidden="true">
            <span>Scroll to investigate</span>
            <ArrowDown className="size-3.5" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
