"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json";

export type GlobeHotspot = {
  incidentId: string;
  country: string;
  countryCode: string;
  longitude: number;
  latitude: number;
  label: string;
  severity: "low" | "medium" | "high" | "critical";
};

type RotatingEarthProps = {
  height?: number;
  className?: string;
  hotspots?: GlobeHotspot[];
  selectedCountryCode?: string;
  onHotspotSelect?: (hotspot: GlobeHotspot) => void;
};

type Dot = [number, number];
type HitTarget = {
  hotspot: GlobeHotspot;
  x: number;
  y: number;
};

function isPointInsideRing(point: Dot, ring: number[][]) {
  const [x, y] = point;
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointInsideFeature(point: Dot, geometry: GeoJSON.Geometry) {
  if (geometry.type === "Polygon") {
    return (
      isPointInsideRing(point, geometry.coordinates[0]) &&
      !geometry.coordinates.slice(1).some((ring) => isPointInsideRing(point, ring))
    );
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(
      (polygon) =>
        isPointInsideRing(point, polygon[0]) &&
        !polygon.slice(1).some((ring) => isPointInsideRing(point, ring)),
    );
  }

  return false;
}

function dotsForFeature(featureData: GeoJSON.Feature, step = 2.15) {
  if (!featureData.geometry) return [];
  const [[minLongitude, minLatitude], [maxLongitude, maxLatitude]] = d3.geoBounds(featureData);
  const dots: Dot[] = [];

  for (let longitude = minLongitude; longitude <= maxLongitude; longitude += step) {
    for (let latitude = minLatitude; latitude <= maxLatitude; latitude += step) {
      if (isPointInsideFeature([longitude, latitude], featureData.geometry)) {
        dots.push([longitude, latitude]);
      }
    }
  }
  return dots;
}

function markerColor(severity: GlobeHotspot["severity"]) {
  if (severity === "critical" || severity === "high") return "#fb7185";
  if (severity === "medium") return "#fbbf24";
  return "#60a5fa";
}

/**
 * An adapted version of the user-provided 21st component. It keeps the original
 * D3 canvas, auto rotation, drag and wheel interactions but bundles land data
 * locally and draws only evidence-backed country hotspots.
 */
export default function RotatingEarth({
  height = 300,
  className = "",
  hotspots = [],
  selectedCountryCode,
  onHotspotSelect,
}: RotatingEarthProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitTargetsRef = useRef<HitTarget[]>([]);
  const [width, setWidth] = useState(360);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resize = () => setWidth(Math.max(260, Math.floor(container.getBoundingClientRect().width)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvasHeight = height;
    canvas.width = width * devicePixelRatio;
    canvas.height = canvasHeight * devicePixelRatio;
    canvas.style.width = width + "px";
    canvas.style.height = canvasHeight + "px";
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    const radius = Math.min(width, canvasHeight) * 0.43;
    const projection = d3
      .geoOrthographic()
      .scale(radius)
      .translate([width / 2, canvasHeight / 2])
      .clipAngle(90)
      .rotate([-42, -10]);
    const path = d3.geoPath(projection, context);
    const land = feature(
      landTopology as unknown as Parameters<typeof feature>[0],
      (landTopology as unknown as { objects: { land: unknown } }).objects.land as never,
    ) as unknown as GeoJSON.FeatureCollection;
    const dots = land.features.flatMap((landFeature) => dotsForFeature(landFeature));
    const graticule = d3.geoGraticule10();
    const rotation: [number, number] = [-42, -10];
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let autoRotate = !prefersReducedMotion;
    let isDragging = false;
    let startPoint = [0, 0];
    let startRotation: [number, number] = [rotation[0], rotation[1]];

    const draw = (elapsed = 0) => {
      context.clearRect(0, 0, width, canvasHeight);
      const scaleFactor = projection.scale() / radius;

      context.save();
      context.beginPath();
      context.arc(width / 2, canvasHeight / 2, projection.scale(), 0, Math.PI * 2);
      context.fillStyle = "#0a0910";
      context.fill();
      context.strokeStyle = "rgba(244, 237, 255, 0.48)";
      context.lineWidth = Math.max(0.8, 1.2 * scaleFactor);
      context.stroke();
      context.clip();

      context.beginPath();
      path(graticule);
      context.strokeStyle = "rgba(216, 197, 236, 0.17)";
      context.lineWidth = Math.max(0.35, 0.58 * scaleFactor);
      context.stroke();

      context.beginPath();
      land.features.forEach((landFeature) => path(landFeature));
      context.strokeStyle = "rgba(237, 229, 246, 0.38)";
      context.lineWidth = Math.max(0.45, 0.76 * scaleFactor);
      context.stroke();

      context.fillStyle = "rgba(203, 193, 218, 0.60)";
      dots.forEach(([longitude, latitude]) => {
        const point = projection([longitude, latitude]);
        if (!point) return;
        context.beginPath();
        context.arc(point[0], point[1], Math.max(0.38, 0.72 * scaleFactor), 0, Math.PI * 2);
        context.fill();
      });
      context.restore();

      hitTargetsRef.current = [];
      hotspots.forEach((hotspot) => {
        const point = projection([hotspot.longitude, hotspot.latitude]);
        if (!point) return;
        const isSelected = hotspot.countryCode === selectedCountryCode;
        const pulse = isSelected ? 0.55 + 0.45 * Math.sin(elapsed / 370) : 0.4;
        const color = markerColor(hotspot.severity);

        context.beginPath();
        context.arc(point[0], point[1], isSelected ? 13 + pulse * 5 : 9, 0, Math.PI * 2);
        context.fillStyle = color + "22";
        context.fill();
        context.beginPath();
        context.arc(point[0], point[1], isSelected ? 5.5 : 4, 0, Math.PI * 2);
        context.fillStyle = color;
        context.fill();
        context.strokeStyle = "#fff7ff";
        context.lineWidth = 1.25;
        context.stroke();

        hitTargetsRef.current.push({ hotspot, x: point[0], y: point[1] });
      });
    };

    const timer = d3.timer((elapsed) => {
      if (autoRotate && !isDragging) {
        rotation[0] += 0.055;
        projection.rotate(rotation);
      }
      draw(elapsed);
    });

    const pointerDown = (event: PointerEvent) => {
      autoRotate = false;
      isDragging = true;
      startPoint = [event.clientX, event.clientY];
      startRotation = [rotation[0], rotation[1]];
      canvas.setPointerCapture(event.pointerId);
    };

    const pointerMove = (event: PointerEvent) => {
      if (!isDragging) return;
      rotation[0] = startRotation[0] + (event.clientX - startPoint[0]) * 0.35;
      rotation[1] = Math.max(-65, Math.min(65, startRotation[1] - (event.clientY - startPoint[1]) * 0.25));
      projection.rotate(rotation);
      draw();
    };

    const pointerUp = (event: PointerEvent) => {
      if (!isDragging) return;
      const move = Math.hypot(event.clientX - startPoint[0], event.clientY - startPoint[1]);
      isDragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

      if (move < 6) {
        const rectangle = canvas.getBoundingClientRect();
        const x = event.clientX - rectangle.left;
        const y = event.clientY - rectangle.top;
        const hit = hitTargetsRef.current.find((target) => Math.hypot(target.x - x, target.y - y) < 20);
        if (hit) onHotspotSelect?.(hit.hotspot);
      }

      if (!prefersReducedMotion) {
        window.setTimeout(() => {
          autoRotate = true;
        }, 900);
      }
    };

    // Zoom is opt-in: a plain wheel must keep scrolling the page. The globe sits in
    // the middle of a scrollable dashboard, and swallowing every wheel event trapped
    // the reader there with no way out. Ctrl/⌘ + wheel is the standard zoom gesture
    // and is the only one we intercept.
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const nextScale = projection.scale() * (event.deltaY > 0 ? 0.92 : 1.08);
      projection.scale(Math.max(radius * 0.8, Math.min(radius * 1.7, nextScale)));
      draw();
    };

    // Keyboard zoom, so the gesture is reachable without a modifier-capable pointer.
    const key = (event: KeyboardEvent) => {
      const step = event.key === "+" || event.key === "=" ? 1.08 : event.key === "-" ? 0.92 : 0;
      if (!step) return;
      event.preventDefault();
      projection.scale(Math.max(radius * 0.8, Math.min(radius * 1.7, projection.scale() * step)));
      draw();
    };

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", key);
    setIsReady(true);

    return () => {
      timer.stop();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", key);
    };
  }, [height, hotspots, onHotspotSelect, selectedCountryCode, width]);

  return (
    <div ref={containerRef} className={"relative isolate " + className}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Interactive globe showing evidence-backed payment incident countries. Drag to rotate, press plus or minus to zoom."
        className="block w-full cursor-grab touch-none rounded-[1.4rem] outline-none focus-visible:ring-2 focus-visible:ring-[#d7a8e4] active:cursor-grabbing"
      />
      {!isReady ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-[#b7adbf]">Loading impact globe…</div>
      ) : null}
      <div className="pointer-events-none absolute bottom-2.5 left-3 rounded-md border border-white/8 bg-black/55 px-2 py-1 text-[10px] text-[#b9afc4] backdrop-blur">
        Drag to rotate · ⌘/Ctrl + scroll to zoom
      </div>
    </div>
  );
}
