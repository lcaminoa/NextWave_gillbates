import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { HumanReviewChip, ReportStatusBadge } from "@/components/ui/status";
import type { IncidentReport } from "@/lib/contracts";
import { relativeTime, time, usd } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One incident, rendered the same way wherever it appears. The Control Room and
 * the queue used to disagree about what an incident even looks like — one led
 * with the machine id, the other with a truncated summary.
 *
 * `density` only changes spacing and how much prose survives; the facts on show
 * are identical, so a card never means something different in two places.
 */
export function IncidentCard({
  report,
  density = "comfortable",
  selected = false,
  onSelect,
  className,
}: {
  report: IncidentReport;
  density?: "compact" | "comfortable";
  selected?: boolean;
  onSelect?: (incidentId: string) => void;
  className?: string;
}) {
  const compact = density === "compact";
  const leadClaim = report.claims[0];

  const facts = [
    { label: "Revenue at risk", value: `${usd(report.estimated_revenue_loss_usd_per_hour)}/hr` },
    { label: "Reported", value: relativeTime(report.generated_at), title: time(report.generated_at) },
    { label: "Cited evidence", value: `${new Set(report.claims.flatMap((claim) => claim.evidence_ids)).size} items` },
    { label: "Claims", value: `${report.claims.length}` },
  ];

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ReportStatusBadge status={report.status} />
        {report.requires_human_review ? <HumanReviewChip required /> : null}
        {/* The id stays available for operators to quote, but it is no longer the headline. */}
        <code className="ml-auto font-mono text-[10px] text-pharos-faint">{report.incident_id}</code>
      </div>

      <p
        className={cn(
          "mt-3 text-left leading-6 text-pharos-ink",
          compact ? "line-clamp-2 text-[13px]" : "text-[15px]",
        )}
      >
        {report.summary}
      </p>

      <dl
        className={cn(
          "mt-4 grid gap-px overflow-hidden rounded-xl border border-pharos-line bg-white/[0.05]",
          compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {(compact ? facts.slice(0, 2) : facts).map((fact) => (
          <div key={fact.label} className="bg-black/40 px-3 py-2.5" title={fact.title}>
            <dt className="eyebrow">{fact.label}</dt>
            <dd className="mt-1 text-[13px] font-semibold text-pharos-strong">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {!compact && leadClaim ? (
        <p className="mt-4 text-[12px] leading-5 text-pharos-faint">
          <span className="text-pharos-muted">Recommendation ·</span> {report.recommended_action}
        </p>
      ) : null}
    </>
  );

  // In the Control Room a card selects a focus; in the queue it opens the workspace.
  if (onSelect) {
    return (
      <button
        type="button"
        onClick={() => onSelect(report.incident_id)}
        aria-pressed={selected}
        className={cn(
          "w-full rounded-2xl border p-4 text-left transition",
          selected
            ? "border-pharos-accent/35 bg-pharos-accent/[0.07]"
            : "border-pharos-line bg-black/[0.16] hover:border-pharos-line hover:bg-white/[0.04]",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <article
      className={cn(
        "rounded-2xl border border-pharos-line bg-black/[0.16] p-5 transition hover:bg-white/[0.03] md:p-6",
        className,
      )}
    >
      {body}
      <Link
        href={`/incidents/${report.incident_id}`}
        className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-pharos-accent/30 bg-pharos-accent/10 px-4 py-2 text-xs font-semibold text-pharos-accent transition hover:bg-pharos-accent/20"
      >
        Open investigation <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </article>
  );
}
