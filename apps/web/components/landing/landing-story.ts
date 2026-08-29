export type CheckpointSide = "left" | "right";
export type TrajectoryTone = "stable" | "deviation" | "evidence";

export type LandingCheckpoint = {
  id: number;
  key: "baseline" | "deviation" | "scope" | "counterfactual" | "decline" | "evidence";
  eyebrow: string;
  primary: string;
  secondary: string;
  start: number;
  end: number;
  side: CheckpointSide;
  x: number;
  y: number;
};

export const landingCheckpoints: LandingCheckpoint[] = [
  {
    id: 1,
    key: "baseline",
    eyebrow: "01 · Baseline",
    primary: "93.9% expected",
    secondary: "Brazil · card payments",
    start: 0.12,
    end: 0.25,
    side: "left",
    x: 0.47,
    y: 0.29,
  },
  {
    id: 2,
    key: "deviation",
    eyebrow: "02 · Sustained deviation",
    primary: "62.4% observed",
    secondary: "−31.4 pp below expected range · four consecutive windows",
    start: 0.25,
    end: 0.4,
    side: "right",
    x: 0.51,
    y: 0.4,
  },
  {
    id: 3,
    key: "scope",
    eyebrow: "03 · Scope narrowed",
    primary: "Brazil · Card",
    secondary: "The system isolates the affected cohort before claiming a cause.",
    start: 0.4,
    end: 0.54,
    side: "left",
    x: 0.47,
    y: 0.51,
  },
  {
    id: 4,
    key: "counterfactual",
    eyebrow: "04 · Counterfactual",
    primary: "AuroraPay · 94.1%",
    secondary: "Same traffic and issuer mix remained healthy.",
    start: 0.54,
    end: 0.68,
    side: "right",
    x: 0.54,
    y: 0.46,
  },
  {
    id: 5,
    key: "decline",
    eyebrow: "05 · Decline pattern",
    primary: "do_not_honor · 71%",
    secondary: "Up from 18% of declines at baseline.",
    start: 0.68,
    end: 0.82,
    side: "left",
    x: 0.5,
    y: 0.58,
  },
  {
    id: 6,
    key: "evidence",
    eyebrow: "06 · Evidence converges",
    primary: "NovaPay × Brazil × Card × Itaú",
    secondary: "Probable · human review required",
    start: 0.82,
    end: 0.96,
    side: "right",
    x: 0.55,
    y: 0.62,
  },
];

type SignalWaypoint = {
  progress: number;
  x: number;
  y: number;
  depth: number;
  scale: number;
};

const signalWaypoints: SignalWaypoint[] = [
  { progress: 0, x: 0.47, y: 0.19, depth: -3.9, scale: 0.54 },
  { progress: 0.12, x: 0.47, y: 0.29, depth: -2.5, scale: 0.67 },
  { progress: 0.25, x: 0.51, y: 0.4, depth: 0.12, scale: 0.91 },
  { progress: 0.4, x: 0.47, y: 0.51, depth: 0.44, scale: 0.94 },
  { progress: 0.54, x: 0.54, y: 0.46, depth: 0.68, scale: 1 },
  { progress: 0.68, x: 0.5, y: 0.58, depth: 0.42, scale: 0.9 },
  { progress: 0.82, x: 0.55, y: 0.62, depth: 0.22, scale: 0.83 },
  { progress: 0.96, x: 0.55, y: 0.62, depth: 0.12, scale: 0.79 },
  { progress: 1, x: 0.57, y: 0.74, depth: -1.05, scale: 0.61 },
];

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

export function getSignalWaypoint(progress: number): SignalWaypoint {
  const value = clamp(progress);
  const nextIndex = signalWaypoints.findIndex((point) => point.progress >= value);
  if (nextIndex <= 0) return signalWaypoints[0];
  if (nextIndex === -1) return signalWaypoints[signalWaypoints.length - 1];

  const previous = signalWaypoints[nextIndex - 1];
  const next = signalWaypoints[nextIndex];
  const local = (value - previous.progress) / (next.progress - previous.progress);
  const eased = local * local * (3 - 2 * local);

  return {
    progress: value,
    x: interpolate(previous.x, next.x, eased),
    y: interpolate(previous.y, next.y, eased),
    depth: interpolate(previous.depth, next.depth, eased),
    scale: interpolate(previous.scale, next.scale, eased),
  };
}

export function getCheckpointVisibility(progress: number, checkpoint: LandingCheckpoint) {
  const enter = clamp((progress - checkpoint.start) / 0.02);
  const exit = checkpoint.key === "evidence"
    ? clamp((0.985 - progress) / 0.025)
    : clamp((checkpoint.end - progress) / 0.02);
  return Math.min(enter, exit);
}

export function getActiveCheckpointIndex(progress: number) {
  return landingCheckpoints.findIndex((checkpoint) => {
    const end = checkpoint.key === "evidence" ? 0.985 : checkpoint.end;
    return progress >= checkpoint.start && progress < end;
  });
}

export function getTrajectoryTone(progress: number): TrajectoryTone {
  if (progress >= 0.82) return "evidence";
  if (progress >= 0.25) return "deviation";
  return "stable";
}

export function getSignalMetric(progress: number) {
  if (progress < 0.25) return { label: "EXPECTED", metric: "93.9%" };
  if (progress < 0.4) return { label: "OBSERVED", metric: "62.4%" };
  if (progress < 0.54) return { label: "COHORT", metric: "BR / CARD" };
  if (progress < 0.68) return { label: "CONTROL", metric: "94.1%" };
  if (progress < 0.82) return { label: "DECLINE", metric: "71%" };
  return { label: "STATUS", metric: "PROBABLE" };
}

export const trajectoryViewBox = { width: 1000, height: 640 };

export const observedTrajectoryPath = `M ${landingCheckpoints.map((checkpoint) => `${checkpoint.x * trajectoryViewBox.width} ${checkpoint.y * trajectoryViewBox.height}`).join(" L ")}`;

export const expectedRangePath = "M 390 174 C 446 170 497 174 545 184 S 639 205 690 214";
