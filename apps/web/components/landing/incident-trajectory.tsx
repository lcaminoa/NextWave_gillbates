import {
  clamp,
  expectedRangePath,
  getActiveCheckpointIndex,
  getTrajectoryTone,
  landingCheckpoints,
  observedTrajectoryPath,
  trajectoryViewBox,
} from "./landing-story";

type IncidentTrajectoryProps = {
  progress: number;
};

export function IncidentTrajectory({ progress }: IncidentTrajectoryProps) {
  const activeIndex = getActiveCheckpointIndex(progress);
  const tone = getTrajectoryTone(progress);
  const pathProgress = clamp((progress - 0.095) / 0.83);

  return (
    <div className={`landing-trajectory landing-trajectory-${tone}`} aria-hidden="true">
      <svg viewBox={`0 0 ${trajectoryViewBox.width} ${trajectoryViewBox.height}`} preserveAspectRatio="none">
        <text className="landing-trajectory-rail-label landing-trajectory-rail-label-expected" x="420" y="79">
          EXPECTED
        </text>
        <text className="landing-trajectory-rail-label" x="492" y="79">
          OBSERVED
        </text>
        <path
          className="landing-trajectory-expected-band"
          d={expectedRangePath}
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - pathProgress * 100}
        />
        <path
          className="landing-trajectory-expected-rail"
          d={expectedRangePath}
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - pathProgress * 100}
        />
        <path
          className="landing-trajectory-observed"
          d={observedTrajectoryPath}
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - pathProgress * 100}
        />

        {landingCheckpoints.map((checkpoint, index) => {
          const x = checkpoint.x * trajectoryViewBox.width;
          const y = checkpoint.y * trajectoryViewBox.height;
          const reveal = clamp((progress - (checkpoint.start - 0.018)) / 0.045);
          const active = index === activeIndex;
          const connectorEnd = 565;
          const control = x + 34;

          return (
            <g key={checkpoint.key} className={active ? "landing-trajectory-checkpoint landing-trajectory-checkpoint-active" : "landing-trajectory-checkpoint"} style={{ opacity: reveal }}>
              <path
                className="landing-trajectory-connector"
                d={`M ${x} ${y} C ${control} ${y}, ${connectorEnd - 26} ${y}, ${connectorEnd} ${y}`}
                pathLength={100}
                strokeDasharray={100}
                strokeDashoffset={active ? 0 : 100}
              />
              <circle className="landing-trajectory-node-halo" cx={x} cy={y} r={active ? 18 : 12} />
              <circle className="landing-trajectory-node" cx={x} cy={y} r={active ? 8.5 : 6.4} />
              <text x={x} y={y + 3.1}>{String(checkpoint.id).padStart(2, "0")}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
