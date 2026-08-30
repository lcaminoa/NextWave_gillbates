import { CircleAlert, CircleCheck, CircleDashed, Radio, ShieldQuestion } from "lucide-react";
import type { ReportStatus } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export type RuntimeStatus = "loading" | "live" | "unavailable";

/**
 * Evidence strength as the contract defines it. "inconclusive" is a mature
 * outcome, not a failure, so it never borrows the critical colour.
 * Colour is never the only carrier: each badge ships an icon and a label.
 */
const reportStatusMeta: Record<ReportStatus, { label: string; icon: typeof CircleCheck; className: string }> = {
  confirmed: {
    label: "Confirmed cause",
    icon: CircleCheck,
    className: "border-signal-info/30 bg-signal-info/10 text-signal-info",
  },
  probable: {
    label: "Probable cause",
    icon: ShieldQuestion,
    className: "border-pharos-accent/30 bg-pharos-accent/10 text-pharos-accent",
  },
  inconclusive: {
    label: "Evidence insufficient",
    icon: CircleDashed,
    className: "border-signal-uncertain/30 bg-signal-uncertain/10 text-signal-uncertain",
  },
};

export function ReportStatusBadge({ status, className }: { status: ReportStatus; className?: string }) {
  const meta = reportStatusMeta[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro font-bold tracking-[0.08em] uppercase",
        meta.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** Recommendation-only posture, straight from `requires_human_review`. */
export function HumanReviewChip({ required, className }: { required: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro font-bold tracking-[0.08em] uppercase",
        required
          ? "border-signal-warning/30 bg-signal-warning/[0.08] text-signal-warning"
          : "border-pharos-line bg-white/[0.03] text-pharos-faint",
        className,
      )}
    >
      <CircleAlert className="size-3" aria-hidden="true" />
      {required ? "Human review required" : "Operator review"}
    </span>
  );
}

const runtimeMeta: Record<RuntimeStatus, { label: string; className: string }> = {
  live: { label: "LIVE", className: "border-signal-healthy/25 bg-signal-healthy/[0.08] text-signal-healthy" },
  loading: { label: "CONNECTING", className: "border-signal-warning/25 bg-signal-warning/[0.08] text-signal-warning" },
  unavailable: { label: "UNAVAILABLE", className: "border-signal-critical/25 bg-signal-critical/[0.08] text-signal-critical" },
};

/**
 * The runtime honesty signal. Present on every product surface at every width —
 * it is the one indicator that must never be hidden to save space.
 */
export function RuntimeIndicator({
  status,
  label,
  className,
}: {
  status: RuntimeStatus;
  label?: string;
  className?: string;
}) {
  const meta = runtimeMeta[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-nano font-bold tracking-[0.12em]",
        meta.className,
        className,
      )}
      role="status"
    >
      <Radio className={cn("size-3", status === "live" && "motion-safe:animate-pulse")} aria-hidden="true" />
      {label ?? meta.label}
    </span>
  );
}
