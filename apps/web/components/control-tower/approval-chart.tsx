"use client";

import { useState } from "react";
import { percent } from "@/lib/format";

type RatePoint = {
  time: string;
  observed: number;
  lower: number;
  upper: number;
  volume: number;
  detected?: boolean;
  investigating?: boolean;
};

const points: RatePoint[] = [
  { time: "15:12", observed: 0.941, lower: 0.918, upper: 0.953, volume: 1680 },
  { time: "15:17", observed: 0.936, lower: 0.918, upper: 0.953, volume: 1712 },
  { time: "15:22", observed: 0.944, lower: 0.917, upper: 0.953, volume: 1736 },
  { time: "15:27", observed: 0.938, lower: 0.917, upper: 0.953, volume: 1698 },
  { time: "15:32", observed: 0.932, lower: 0.917, upper: 0.952, volume: 1759 },
  { time: "15:37", observed: 0.941, lower: 0.917, upper: 0.952, volume: 1790 },
  { time: "15:42", observed: 0.917, lower: 0.916, upper: 0.952, volume: 1814 },
  { time: "15:47", observed: 0.812, lower: 0.916, upper: 0.952, volume: 1821, detected: true },
  { time: "15:52", observed: 0.624, lower: 0.915, upper: 0.951, volume: 1842, investigating: true },
  { time: "15:57", observed: 0.646, lower: 0.915, upper: 0.951, volume: 1807 },
];

function linePath(values: number[], x: (index: number) => number, y: (value: number) => number) {
  return values
    .map((value, index) => (index === 0 ? "M" : "L") + x(index).toFixed(2) + "," + y(value).toFixed(2))
    .join(" ");
}

export function ApprovalChart() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(8);
  const width = 920;
  const height = 294;
  const inset = { top: 18, right: 22, bottom: 38, left: 48 };
  const innerWidth = width - inset.left - inset.right;
  const innerHeight = height - inset.top - inset.bottom;
  const x = (index: number) => inset.left + (index / (points.length - 1)) * innerWidth;
  const y = (value: number) => inset.top + ((0.98 - value) / 0.42) * innerHeight;
  const observedPath = linePath(points.map((point) => point.observed), x, y);
  const upperPath = linePath(points.map((point) => point.upper), x, y);
  const lowerPath = linePath(
    [...points].reverse().map((point) => point.lower),
    (index) => x(points.length - 1 - index),
    y,
  );
  const active = hoveredIndex === null ? null : points[hoveredIndex];
  const activeX = hoveredIndex === null ? 0 : x(hoveredIndex);

  return (
    <div className="relative mt-5 min-h-0 flex-1">
      <svg
        className="h-full min-h-[235px] w-full overflow-visible"
        viewBox={"0 0 " + width + " " + height}
        role="img"
        aria-label="Approval rate compared to its credible expected range. A sustained drop begins at 15:47."
      >
        <defs>
          <linearGradient id="expectedBand" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c98bd8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#c98bd8" stopOpacity="0.035" />
          </linearGradient>
          <linearGradient id="observedFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#efb2dc" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#efb2dc" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.6, 0.7, 0.8, 0.9].map((tick) => (
          <g key={tick}>
            <line
              x1={inset.left}
              x2={width - inset.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgba(230,222,239,0.10)"
              strokeDasharray="3 5"
            />
            <text x={inset.left - 12} y={y(tick) + 4} textAnchor="end" fill="#9f94aa" fontSize="10">
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}

        <path d={upperPath + " " + lowerPath + " Z"} fill="url(#expectedBand)" />
        <path d={upperPath} fill="none" stroke="rgba(218,190,230,0.72)" strokeDasharray="4 5" strokeWidth="1.2" />
        <path
          d={
            observedPath +
            " L" +
            x(points.length - 1).toFixed(2) +
            "," +
            y(0.56).toFixed(2) +
            " L" +
            x(0).toFixed(2) +
            "," +
            y(0.56).toFixed(2) +
            " Z"
          }
          fill="url(#observedFill)"
        />
        <path d={observedPath} fill="none" stroke="#ecc2e4" strokeWidth="2.2" />

        {points.map((point, index) => (
          <g key={point.time}>
            {point.detected || point.investigating ? (
              <>
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1={inset.top}
                  y2={height - inset.bottom}
                  stroke={point.investigating ? "#fb7185" : "#e7acd7"}
                  strokeDasharray="3 4"
                  strokeOpacity="0.65"
                />
                <text
                  x={x(index)}
                  y={inset.top + 10}
                  textAnchor={point.investigating ? "end" : "start"}
                  dx={point.investigating ? -5 : 5}
                  fill={point.investigating ? "#fb9aae" : "#e7c0df"}
                  fontSize="9"
                  fontWeight="600"
                >
                  {point.investigating ? "INVESTIGATION" : "DETECTED"}
                </text>
              </>
            ) : null}
            <circle
              cx={x(index)}
              cy={y(point.observed)}
              r={hoveredIndex === index ? 5.2 : 2.5}
              fill={index >= 7 ? "#fb7185" : "#e8bfe0"}
              stroke="#160f19"
              strokeWidth="2"
              onMouseEnter={() => setHoveredIndex(index)}
              onFocus={() => setHoveredIndex(index)}
              tabIndex={0}
              aria-label={point.time + ", observed " + percent(point.observed)}
            />
          </g>
        ))}

        {points.map((point, index) => (
          <text key={point.time} x={x(index)} y={height - 13} textAnchor="middle" fill="#a99eaf" fontSize="10">
            {index % 2 === 0 ? point.time : ""}
          </text>
        ))}

        {active ? (
          <g transform={"translate(" + Math.min(activeX + 15, width - 174) + " " + Math.max(y(active.observed) - 83, 16) + ")"}>
            <rect width="160" height="66" rx="10" fill="#1a131d" stroke="rgba(237,215,240,0.18)" />
            <text x="12" y="18" fill="#f8f0fa" fontSize="10" fontWeight="700">
              {active.time} · {active.volume.toLocaleString()} tx/min
            </text>
            <text x="12" y="37" fill="#eeb5db" fontSize="10">
              Observed {percent(active.observed)}
            </text>
            <text x="12" y="53" fill="#bdb1c3" fontSize="10">
              Expected {percent(active.lower)}–{percent(active.upper)}
            </text>
          </g>
        ) : null}
      </svg>
      <div className="pointer-events-none absolute bottom-1 left-12 flex items-center gap-4 text-[10px] text-[#a99eaf]">
        <span className="flex items-center gap-1.5">
          <i className="h-1.5 w-1.5 rounded-full bg-[#e8bfe0]" /> Observed approval
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-px w-3 border-t border-dashed border-[#d8bbe4]" /> Expected credible range
        </span>
      </div>
    </div>
  );
}
