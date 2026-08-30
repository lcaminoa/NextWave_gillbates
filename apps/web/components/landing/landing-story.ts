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
    primary: "93.9% was the learned baseline",
    secondary: "Brazil · card payments",
    start: 0.12,
    end: 0.25,
    side: "right",
    x: 0.49,
    y: 0.19,
  },
  {
    id: 2,
    key: "deviation",
    eyebrow: "02 · Sustained deviation",
    primary: "Approval fell to 62.4%",
    secondary: "−31.4 pp below its learned range · four consecutive windows",
    start: 0.25,
    end: 0.4,
    side: "right",
    x: 0.49,
    y: 0.32,
  },
  {
    id: 3,
    key: "scope",
    eyebrow: "03 · Scope narrowed",
    primary: "Brazil · Card",
    secondary: "The system isolates the affected cohort before claiming a cause.",
    start: 0.4,
    end: 0.54,
    side: "right",
    x: 0.49,
    y: 0.45,
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
    x: 0.49,
    y: 0.58,
  },
  {
    id: 5,
    key: "decline",
    eyebrow: "05 · Decline pattern",
    primary: "do_not_honor · 71%",
    secondary: "Up from 18% of declines at baseline.",
    start: 0.68,
    end: 0.82,
    side: "right",
    x: 0.49,
    y: 0.69,
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
    x: 0.49,
    y: 0.8,
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
  { progress: 0, x: 0.52, y: 0.19, depth: -3.9, scale: 0.5 },
  { progress: 0.12, x: 0.25, y: 0.5, depth: -1.45, scale: 0.5 },
  { progress: 0.25, x: 0.25, y: 0.5, depth: 0.02, scale: 0.58 },
  { progress: 0.4, x: 0.24, y: 0.5, depth: 0.26, scale: 0.59 },
  { progress: 0.54, x: 0.25, y: 0.48, depth: 0.46, scale: 0.61 },
  { progress: 0.68, x: 0.25, y: 0.51, depth: 0.24, scale: 0.57 },
  { progress: 0.82, x: 0.25, y: 0.51, depth: 0.08, scale: 0.55 },
  { progress: 0.96, x: 0.25, y: 0.51, depth: 0.02, scale: 0.53 },
  { progress: 1, x: 0.25, y: 0.65, depth: -0.75, scale: 0.43 },
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

export type CardSignalStatus = {
  label: string;
  detail: string;
};

const cardSignalStatuses: CardSignalStatus[] = [
  { label: "SIGNAL", detail: "TRACKING" },
  { label: "BASELINE", detail: "STABLE" },
  { label: "DEVIATION", detail: "DETECTED" },
  { label: "COHORT", detail: "ISOLATED" },
  { label: "CONTROL", detail: "HEALTHY" },
  { label: "DECLINE SHIFT", detail: "OBSERVED" },
  { label: "PROBABLE", detail: "HUMAN REVIEW" },
];

export function getCardSignalStatus(progress: number): CardSignalStatus {
  const activeIndex = getActiveCheckpointIndex(progress);
  if (activeIndex >= 0) return cardSignalStatuses[activeIndex + 1];
  if (progress >= 0.82) return cardSignalStatuses[6];
  return cardSignalStatuses[0];
}

export const trajectoryViewBox = { width: 1000, height: 640 };

export const observedTrajectoryPath = `M ${landingCheckpoints.map((checkpoint) => `${checkpoint.x * trajectoryViewBox.width} ${checkpoint.y * trajectoryViewBox.height}`).join(" L ")}`;
