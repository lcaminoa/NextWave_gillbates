import {
  clamp,
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
        <path className="landing-trajectory-spine" d={observedTrajectoryPath} />
        <path
          className="landing-trajectory-trace"
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

          return (
            <g
              key={checkpoint.key}
              className={`landing-trajectory-checkpoint${active ? " landing-trajectory-checkpoint-active" : ""}`}
              style={{ opacity: reveal }}
            >
              {active ? (
                <path
                  className="landing-trajectory-leader"
                  d={`M ${x + 19} ${y} C ${x + 46} ${y}, 522 ${y}, 545 ${y}`}
                />
              ) : null}
              <circle className="landing-trajectory-node-halo" cx={x} cy={y} r={active ? 18 : 7.2} />
              <circle className="landing-trajectory-node" cx={x} cy={y} r={active ? 7.5 : 4.3} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
