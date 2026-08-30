import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A number never ships alone. `caption` is required by design: FRONTEND_UI_UX_SPEC 6
 * asks every KPI to say whether its value is good, bad or simply not yet meaningful,
 * because "66.7%" on its own tells an operator nothing.
 */
export function Metric({
  label,
  value,
  unit,
  caption,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  caption: ReactNode;
  tone?: "neutral" | "healthy" | "warning" | "critical" | "uncertain";
  icon?: ReactNode;
  className?: string;
}) {
  const toneClass = {
    neutral: "text-pharos-strong",
    healthy: "text-signal-healthy",
    warning: "text-signal-warning",
    critical: "text-signal-critical",
    uncertain: "text-signal-uncertain",
  }[tone];

  return (
    <article
      className={cn(
        "flex flex-col justify-between rounded-2xl border border-pharos-line bg-black/[0.16] p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {icon ? <span className="shrink-0 text-pharos-faint">{icon}</span> : null}
      </div>
      <p
        data-metric-value
        className={cn("mt-3 flex items-baseline gap-1.5 text-figure leading-none font-semibold", toneClass)}
      >
        {value}
        {unit ? <span className="text-small font-medium tracking-normal text-pharos-faint">{unit}</span> : null}
      </p>
      <p className="mt-2 text-micro leading-4 text-pharos-faint">{caption}</p>
    </article>
  );
}
