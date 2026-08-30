"use client";

import Image from "next/image";
import { createRef, forwardRef, useRef, useState } from "react";
import { Bell, GitCompareArrows, Gauge, Mail, MessageCircle, PieChart, UserRound, Waves } from "lucide-react";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { cn } from "@/lib/utils";

/**
 * What actually happens when a drop is confirmed, drawn as one chain.
 *
 * The left column is what PHAROS observes — evidence sources, not third-party
 * logos. The product is not integrated with Stripe or Notion, and a hub of
 * vendor marks would claim it is.
 *
 * The chain ends at a person, and nothing leaves that node. That is the whole
 * point of the graphic: the system's job finishes at informing a human, and the
 * absence of an outgoing beam says so more plainly than a caption could.
 */

const EVIDENCE = [
  { key: "stream", icon: Waves, label: "Live payment stream", detail: "Every authorisation, as it happens" },
  { key: "baseline", icon: Gauge, label: "Learned baseline", detail: "Beta-Binomial, per segment" },
  { key: "control", icon: GitCompareArrows, label: "Counterfactual control", detail: "The healthy twin that rules causes out" },
  { key: "declines", icon: PieChart, label: "Decline-code mix", detail: "How the rejections shift" },
] as const;

/**
 * Channels are data, not markup, so dropping one when a provider is not ready is
 * a one-line change rather than a redraw. Copy says "notifies" and never
 * "delivered": the product only claims a send was accepted.
 */
const CHANNELS = [
  { key: "in-app", icon: Bell, label: "In-app", detail: "Always" },
  { key: "email", icon: Mail, label: "Email", detail: "High & critical" },
  { key: "whatsapp", icon: MessageCircle, label: "WhatsApp", detail: "High & critical" },
] as const;

/**
 * A node with optional connector ports on its edges. The beam anchors to the port
 * rather than to the node's centre: these cards are several hundred pixels wide,
 * and a centre anchor buried the first half of every path behind the card that
 * emitted it, which is what made the lines look severed.
 */
const Node = forwardRef<
  HTMLDivElement,
  {
    className?: string;
    children: React.ReactNode;
    portLeft?: React.Ref<HTMLSpanElement>;
    portRight?: React.Ref<HTMLSpanElement>;
  }
>(function Node({ className, children, portLeft, portRight }, ref) {
  return (
    <div ref={ref} className={cn("pipeline-node", className)}>
      {portLeft ? <span ref={portLeft} className="pipeline-port pipeline-port-left" aria-hidden="true" /> : null}
      {children}
      {portRight ? <span ref={portRight} className="pipeline-port pipeline-port-right" aria-hidden="true" /> : null}
    </div>
  );
});

export function LandingPipeline() {
  const container = useRef<HTMLDivElement>(null);
  // Stable ref objects, created once. A fresh `{ current }` literal per render
  // would re-run every beam's measuring effect on every render; holding them in
  // state rather than in a ref keeps them readable during render.
  const [evidencePorts] = useState(() => EVIDENCE.map(() => createRef<HTMLSpanElement>()));
  const [channelInPorts] = useState(() => CHANNELS.map(() => createRef<HTMLSpanElement>()));
  const [channelOutPorts] = useState(() => CHANNELS.map(() => createRef<HTMLSpanElement>()));
  const coreRef = useRef<HTMLDivElement>(null);
  const personRef = useRef<HTMLDivElement>(null);

  return (
    <section className="landing-pipeline-section" id="pipeline" aria-labelledby="pipeline-heading">
      <header className="landing-section-intro">
        <span>What happens next / 03</span>
        <h2 id="pipeline-heading">The chain ends at a person.</h2>
        <p>
          A confirmed drop opens an investigation, and the investigation reaches whoever runs the
          business. PHAROS never takes the next step itself — no traffic is rerouted, no provider is
          switched, nothing is executed.
        </p>
      </header>

      <div className="landing-pipeline-stage" ref={container}>
        <div className="pipeline-column pipeline-column-evidence">
          <p className="pipeline-column-label">What it observes</p>
          {EVIDENCE.map((item, index) => {
            const Icon = item.icon;
            return (
              <Node
                key={item.key}
                className="pipeline-node-wide"
                portRight={evidencePorts[index]}
              >
                <span className="pipeline-node-icon">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="pipeline-node-copy">
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </Node>
            );
          })}
        </div>

        <div className="pipeline-column pipeline-column-core">
          <Node ref={coreRef} className="pipeline-node-core">
            <Image
              src="/assets/pharos-icon-simplified-bone.svg"
              alt=""
              width={34}
              height={34}
              aria-hidden="true"
            />
          </Node>
          <p className="pipeline-core-label">PHAROS</p>
          <p className="pipeline-core-detail">Detects · investigates · cites evidence</p>
        </div>

        <div className="pipeline-column pipeline-column-channels">
          <p className="pipeline-column-label">How it notifies</p>
          {CHANNELS.map((item, index) => {
            const Icon = item.icon;
            return (
              <Node
                key={item.key}
                portLeft={channelInPorts[index]}
                portRight={channelOutPorts[index]}
              >
                <span className="pipeline-node-icon">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="pipeline-node-copy">
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </Node>
            );
          })}
        </div>

        <div className="pipeline-column pipeline-column-person">
          <Node ref={personRef} className="pipeline-node-person">
            <UserRound className="size-5" aria-hidden="true" />
          </Node>
          <p className="pipeline-core-label">Business owner</p>
          {/* The terminus. No beam leaves this node, and the seal says why. */}
          <p className="pipeline-terminus">Decides — nothing is executed</p>
        </div>

        {EVIDENCE.map((item, index) => (
          <AnimatedBeam
            key={`in-${item.key}`}
            containerRef={container}
            fromRef={evidencePorts[index]}
            toRef={coreRef}
            curvature={(1.5 - index) * 18}
            duration={4.2}
            delay={index * 0.28}
            pathColor="#cbbcd6"
            pathWidth={2}
            pathOpacity={0.32}
            gradientStartColor="#7ef0cd"
            gradientStopColor="#f0b6ef"
          />
        ))}

        {CHANNELS.map((item, index) => (
          <AnimatedBeam
            key={`out-${item.key}`}
            containerRef={container}
            fromRef={coreRef}
            toRef={channelInPorts[index]}
            curvature={(1 - index) * 16}
            duration={3.4}
            delay={1.5 + index * 0.2}
            pathColor="#cbbcd6"
            pathWidth={2}
            pathOpacity={0.32}
            gradientStartColor="#f0b6ef"
            gradientStopColor="#ffd98f"
          />
        ))}

        {CHANNELS.map((item, index) => (
          <AnimatedBeam
            key={`person-${item.key}`}
            containerRef={container}
            fromRef={channelOutPorts[index]}
            toRef={personRef}
            curvature={(1 - index) * 14}
            duration={3}
            delay={2.6 + index * 0.18}
            pathColor="#cbbcd6"
            pathWidth={2}
            pathOpacity={0.32}
            gradientStartColor="#ffd98f"
            gradientStopColor="#ffd98f"
          />
        ))}
      </div>

      <p className="landing-pipeline-note">
        Email and WhatsApp report as <em>send accepted</em> once the provider answers. Delivery is only
        claimed when a provider confirms it.
      </p>
    </section>
  );
}
