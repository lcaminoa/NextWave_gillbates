import { landingCheckpoints, observedTrajectoryPath, trajectoryViewBox } from "./landing-story";

type IncidentTrajectoryProps = {
  /** Index of the beat currently on screen, or -1. The only value that changes markup. */
  activeIndex: number;
};

/**
 * The scroll spine. Everything continuous — how far the trace has drawn, how far
 * each node has faded up — is expressed in CSS against the --p and --trace custom
 * properties the hero writes each frame, so this component renders once per beat
 * instead of once per frame.
 *
 * The active node also used to jump: its radius was swapped between two values,
 * which popped. Radii are constant now and the emphasis is a transformed scale,
 * so CSS can ease it.
 */
export function IncidentTrajectory({ activeIndex }: IncidentTrajectoryProps) {
  return (
    <div className="landing-trajectory" aria-hidden="true">
      <svg
        viewBox={`0 0 ${trajectoryViewBox.width} ${trajectoryViewBox.height}`}
        preserveAspectRatio="none"
      >
        <path className="landing-trajectory-spine" d={observedTrajectoryPath} />
        <path
          className="landing-trajectory-trace"
          d={observedTrajectoryPath}
          pathLength={100}
          strokeDasharray={100}
        />

        {landingCheckpoints.map((checkpoint, index) => {
          const x = checkpoint.x * trajectoryViewBox.width;
          const y = checkpoint.y * trajectoryViewBox.height;
          const active = index === activeIndex;

          return (
            <g
              key={checkpoint.key}
              className="landing-trajectory-checkpoint"
              data-active={active ? "true" : "false"}
              // Each node fades in against its own start, computed in CSS from --p.
              style={{ ["--start" as string]: checkpoint.start }}
            >
              <path
                className="landing-trajectory-leader"
                d={`M ${x + 19} ${y} C ${x + 46} ${y}, 522 ${y}, 545 ${y}`}
              />
              <circle className="landing-trajectory-node-halo" cx={x} cy={y} r={7.2} />
              <circle className="landing-trajectory-node" cx={x} cy={y} r={4.3} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
