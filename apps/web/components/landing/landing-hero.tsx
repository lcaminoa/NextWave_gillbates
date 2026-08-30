"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent } from "react";
import type { ApprovalSignalSceneProps, LandingPointer } from "./approval-signal-scene";
import { IncidentTrajectory } from "./incident-trajectory";
import {
  clamp,
  getCardSignalStatus,
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

/**
 * Reveal is driven by the --reveal custom property of whichever block contains
 * the line, not by a prop. Passing a number per frame meant re-rendering every
 * masked line sixty times a second just to move it.
 */
function MaskedLine({ children }: { children: React.ReactNode }) {
  return (
    <span className="landing-mask-line">
      <span className="landing-mask-inner">{children}</span>
    </span>
  );
}

/**
 * Shown until the WebGL scene reports ready, and permanently when WebGL is
 * unavailable. It writes its own transform inside an animation frame rather than
 * taking progress as a prop: this element moves continuously, and a prop would
 * put it back inside the per-frame React render the rest of the hero just left.
 */
function SignalFallback({
  progressRef,
  reducedMotion,
}: {
  progressRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const apply = (progress: number) => {
      const waypoint = getSignalWaypoint(progress);
      const tone = getTrajectoryTone(progress);
      const status = getCardSignalStatus(progress);
      const finalUnseal = clamp((progress - 0.958) / 0.042);
      const x = (waypoint.x - 0.5) * 100;
      const y = (waypoint.y - 0.5) * 100;

      card.style.transform =
        `translate3d(${x}vw, ${y}vh, 0) rotateX(${7 + progress * 9}deg)`
        + ` rotateY(${-13 + progress * 12}deg) rotateZ(${-5 + progress * 11}deg)`
        + ` scale(${waypoint.scale})`;
      card.style.setProperty("--card-unseal", finalUnseal.toFixed(4));
      card.dataset.tone = tone;
      const marking = card.querySelector<HTMLElement>(".landing-payment-card-marking");
      if (marking) {
        marking.dataset.state = status.label;
        marking.dataset.detail = status.detail;
      }
    };

    if (reducedMotion) {
      apply(0.58);
      return;
    }

    let frame = window.requestAnimationFrame(function loop() {
      apply(progressRef.current);
      frame = window.requestAnimationFrame(loop);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [progressRef, reducedMotion]);

  return (
    <div className="landing-signal-fallback" aria-hidden="true">
      <div ref={cardRef} className="landing-payment-card-fallback">
        <i className="landing-payment-card-edge" />
        <i className="landing-payment-card-face" />
        <i className="landing-payment-card-marking" />
        <i className="landing-payment-card-chip" />
        <i className="landing-payment-card-evidence-layer landing-payment-card-evidence-layer-a" />
        <i className="landing-payment-card-evidence-layer landing-payment-card-evidence-layer-b" />
      </div>
    </div>
  );
}

export function LandingHero() {
  const storyRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const pointerRef = useRef<LandingPointer>({ x: 0, y: 0 });
  // Only the discrete part of the scene lives in React state. The continuous
  // part is written straight to CSS custom properties, so a frame costs a few
  // style writes instead of a full re-render of the hero.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [introEngaged, setIntroEngaged] = useState(true);
  const [webglAvailable, setWebglAvailable] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;

    let rawProgress = 0;
    let frame = 0;

    const readScroll = () => {
      const element = storyRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const travel = Math.max(element.offsetHeight - window.innerHeight, 1);
      rawProgress = clamp(-rect.top / travel);
    };

    const paint = (value: number) => {
      const stage = stageRef.current;
      if (!stage) return;

      const intro = clamp((0.12 - value) / 0.035);
      const index = getActiveCheckpointIndex(value);
      const checkpoint = index >= 0 ? landingCheckpoints[index] : undefined;
      const caption = checkpoint ? getCheckpointVisibility(value, checkpoint) : 0;
      const reveal = checkpoint ? clamp((value - checkpoint.start) / 0.02) : 0;

      // Opacity and transform on these two blocks are written directly rather than
      // through a custom property. Both work; a direct write is chosen because
      // these values change every frame and reading back an explicit style is
      // simpler to reason about than a chain of calc(). Neither element carries a
      // CSS transition any more: the value arriving here is already smoothed by
      // the scroll lerp, and a transition on top would be a second, slower easing
      // fighting the first.
      const introEl = introRef.current;
      if (introEl) {
        introEl.style.opacity = String(intro);
        introEl.style.transform = `translate3d(0, ${(1 - intro) * -22}px, 0)`;
        introEl.style.visibility = intro > 0.02 ? "visible" : "hidden";
        introEl.style.pointerEvents = intro > 0.02 ? "auto" : "none";
      }

      const captionEl = captionRef.current;
      if (captionEl) {
        captionEl.style.opacity = String(caption);
        captionEl.style.transform = `translate3d(0, ${(1 - caption) * 14}px, 0)`;
        captionEl.style.visibility = caption > 0.02 ? "visible" : "hidden";
      }

      stage.style.setProperty("--p", value.toFixed(4));
      stage.style.setProperty("--intro", intro.toFixed(4));
      stage.style.setProperty("--caption", caption.toFixed(4));
      stage.style.setProperty("--caption-reveal", reveal.toFixed(4));
      stage.style.setProperty("--trace", clamp((value - 0.095) / 0.83).toFixed(4));
      // Tone is a band, not a curve, so it rides an attribute and CSS transitions it.
      stage.dataset.tone = getTrajectoryTone(value);

      // Markup only changes when the active beat does — six times across the
      // whole scene rather than sixty times a second.
      setActiveIndex((current) => (current === index ? current : index));
      setIntroEngaged((current) => {
        const engaged = intro > 0.02;
        return current === engaged ? current : engaged;
      });
    };

    const tick = () => {
      // Smoothing is per-frame, so a shorter scene needs a tighter follow: at the
      // old 0.08 over the old travel the scene visibly lagged the wheel.
      const next = progressRef.current + (rawProgress - progressRef.current) * 0.16;
      const settled = Math.abs(next - rawProgress) < 0.0002;
      progressRef.current = settled ? rawProgress : next;
      paint(progressRef.current);
      // Stop once the scene has caught up. The loop used to run forever, so the
      // landing re-rendered sixty times a second while sitting perfectly still —
      // a fan-spinning idle cost on whatever laptop is driving the demo.
      frame = settled ? 0 : window.requestAnimationFrame(tick);
    };

    const start = () => {
      readScroll();
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    start();
    window.addEventListener("scroll", start, { passive: true });
    window.addEventListener("resize", start);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", start);
      window.removeEventListener("resize", start);
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
  const activeCheckpoint = !reducedMotion && activeIndex >= 0 ? landingCheckpoints[activeIndex] : undefined;
  const canRenderScene = webglAvailable && !reducedMotion;

  /**
   * The stage rect is measured once and re-measured only when the geometry can
   * actually have changed. Reading getBoundingClientRect inside the move handler
   * forced a layout flush on every pointer event — hundreds per second on a
   * high-polling mouse — which is what made the parallax feel steppy rather than
   * smooth. The pointer itself is cheap; measuring it was not.
   */
  const stageRef = useRef<HTMLDivElement>(null);
  const stageRectRef = useRef<DOMRect | null>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const measure = () => {
      stageRectRef.current = stageRef.current?.getBoundingClientRect() ?? null;
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [reducedMotion]);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = stageRectRef.current;
    if (!rect || !rect.width || !rect.height) return;
    pointerRef.current = {
      x: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
      y: clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
    };
  };

  return (
    <section ref={storyRef} className={reducedMotion ? "landing-hero landing-hero-reduced" : "landing-hero"} aria-labelledby="landing-heading">
      <div
        ref={stageRef}
        className="landing-hero-stage"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          pointerRef.current = { x: 0, y: 0 };
        }}
      >

        <div className="landing-hero-atmosphere" aria-hidden="true" />
        {!reducedMotion ? (
          <div className="landing-stage-watermark" aria-hidden="true">
            <span>{activeCheckpoint ? `0${activeCheckpoint.id}` : "PHAROS"}</span>
          </div>
        ) : null}

        <div className="landing-scene-wrap">
          {canRenderScene ? <ApprovalSignalScene progressRef={progressRef} pointerRef={pointerRef} onReady={onSceneReady} /> : null}
          {!sceneReady ? <SignalFallback progressRef={progressRef} reducedMotion={reducedMotion} /> : null}
        </div>

        {!reducedMotion ? <IncidentTrajectory activeIndex={activeIndex} /> : null}

        <div
          className="landing-hero-intro"
          ref={introRef}
          aria-hidden={!introEngaged}
        >
          <MaskedLine>
            <span className="landing-hero-eyebrow">PHAROS · Payment Incident Intelligence</span>
          </MaskedLine>
          <h1 id="landing-heading">
            <MaskedLine>When approval drops,</MaskedLine>
            <MaskedLine>
              <em>find what changed.</em>
            </MaskedLine>
          </h1>
          <MaskedLine>
            <p>PHAROS turns a payment anomaly into evidence your team can verify.</p>
          </MaskedLine>
          <div className="landing-hero-actions-mask">
            <div className="landing-hero-actions">
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
            ref={captionRef}
          >
            <MaskedLine>
              <span className="landing-checkpoint-eyebrow">{activeCheckpoint.eyebrow}</span>
            </MaskedLine>
            <MaskedLine>
              <strong>{activeCheckpoint.primary}</strong>
            </MaskedLine>
            <MaskedLine>
              <p>{activeCheckpoint.secondary}</p>
            </MaskedLine>
          </div>
        ) : null}

        {!reducedMotion && introEngaged ? (
          <div className="landing-scroll-cue" aria-hidden="true">
            <span>Scroll to investigate</span>
            <ArrowDown className="size-3.5" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
