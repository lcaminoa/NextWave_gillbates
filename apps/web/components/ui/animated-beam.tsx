"use client";

import { RefObject, useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface AnimatedBeamProps {
  className?: string;
  // React 19's useRef<T>(null) yields RefObject<T | null>, so the null has to be
  // part of the contract or every call site fails to type-check.
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  delay?: number;
  duration?: number;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
}

export const AnimatedBeam: React.FC<AnimatedBeamProps> = ({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  // Fixed rather than Math.random(): a random default differs between the server
  // and client render, and it makes a set of beams impossible to choreograph.
  // Stagger deliberately with `delay` and `duration` at the call site.
  duration = 5,
  delay = 0,
  pathColor = "gray",
  pathWidth = 2,
  pathOpacity = 0.2,
  gradientStartColor = "#ffaa40",
  gradientStopColor = "#9c40ff",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}) => {
  const id = useId();
  const [pathD, setPathD] = useState("");
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });
  // framer-motion animates SVG attributes in JavaScript, so the global CSS
  // reduced-motion rule cannot reach it. The beam has to opt out itself.
  const prefersReducedMotion = useReducedMotion();

  const gradientCoordinates = reverse
    ? {
        x1: ["90%", "-10%"],
        x2: ["100%", "0%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      }
    : {
        x1: ["10%", "110%"],
        x2: ["0%", "100%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      };

  useEffect(() => {
    const updatePath = () => {
      if (containerRef.current && fromRef.current && toRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const rectA = fromRef.current.getBoundingClientRect();
        const rectB = toRef.current.getBoundingClientRect();

        const svgWidth = containerRect.width;
        const svgHeight = containerRect.height;
        setSvgDimensions({ width: svgWidth, height: svgHeight });

        const startX = rectA.left - containerRect.left + rectA.width / 2 + startXOffset;
        const startY = rectA.top - containerRect.top + rectA.height / 2 + startYOffset;
        const endX = rectB.left - containerRect.left + rectB.width / 2 + endXOffset;
        const endY = rectB.top - containerRect.top + rectB.height / 2 + endYOffset;

        const controlY = startY - curvature;
        const d = `M ${startX},${startY} Q ${(startX + endX) / 2},${controlY} ${endX},${endY}`;
        setPathD(d);
      }
    };

    // Observing only the container is not enough. A path is measured from the two
    // endpoints, and those can move without the container ever changing size —
    // a web font swapping in, an image settling, a sibling reflowing. When that
    // happened the beam kept its first measurement and drew to the wrong place.
    const resizeObserver = new ResizeObserver(() => updatePath());
    for (const element of [containerRef.current, fromRef.current, toRef.current]) {
      if (element) resizeObserver.observe(element);
    }

    // Font swap is the common case: text metrics change after first paint.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) updatePath();
    });

    window.addEventListener("resize", updatePath);
    updatePath();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePath);
    };
  }, [
    containerRef,
    fromRef,
    toRef,
    curvature,
    startXOffset,
    startYOffset,
    endXOffset,
    endYOffset,
  ]);

  return (
    <svg
      fill="none"
      width={svgDimensions.width}
      height={svgDimensions.height}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("pointer-events-none absolute top-0 left-0 transform-gpu stroke-2", className)}
      viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
      aria-hidden="true"
    >
      <path
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />
      {/* With motion reduced, the resting path above is the whole graphic: the
          connection still reads, nothing travels along it. */}
      {prefersReducedMotion ? null : (
        <>
          <path
            d={pathD}
            strokeWidth={pathWidth}
            stroke={`url(#${id})`}
            strokeOpacity="1"
            strokeLinecap="round"
          />
          <defs>
            <motion.linearGradient
              className="transform-gpu"
              id={id}
              gradientUnits="userSpaceOnUse"
              initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
              animate={{
                x1: gradientCoordinates.x1,
                x2: gradientCoordinates.x2,
                y1: gradientCoordinates.y1,
                y2: gradientCoordinates.y2,
              }}
              transition={{
                delay,
                duration,
                ease: [0.16, 1, 0.3, 1],
                repeat: Infinity,
                repeatDelay: 0,
              }}
            >
              <stop stopColor={gradientStartColor} stopOpacity="0" />
              <stop stopColor={gradientStartColor} />
              <stop offset="32.5%" stopColor={gradientStopColor} />
              <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
            </motion.linearGradient>
          </defs>
        </>
      )}
    </svg>
  );
};
