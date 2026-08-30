"use client";

import Link from "next/link";
import { Check, CircleAlert, Gauge, Link2, LockKeyhole, Minus, X } from "lucide-react";
import type { BlindTrialEvaluation, BlindTrialOutcome } from "@/lib/api/control-tower";
import type { ChaosSpec } from "@/lib/contracts";
import { dimensionLabel, dimensionValueLabel, type DimensionField } from "@/lib/dimensions";
import { DISPLAY_TIME_ZONE_LABEL, time } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * How the run scored against a truth the investigator never saw.
 *
 * The binding happens before the reveal, so no report can be chosen afterwards
 * for resembling the answer — which is the only thing that makes an automatic
 * score worth anything. The outcome vocabulary keeps the uncomfortable results:
 * a scope that was too specific, a contradiction, an abstention, or no report at
 * all are all sayable here, and none of them is dressed up as a partial win.
 */

const outcomeCopy: Record<BlindTrialOutcome, { label: string; detail: string; tone: "match" | "partial" | "mismatch" }> = {
  exact: {
    label: "Exact match",
    detail: "Every injected dimension was named, and nothing was added that was not there.",
    tone: "match",
  },
  partial: {
    label: "Partial match",
    detail: "The named dimensions were right, but the scope stopped short of the injected truth.",
    tone: "partial",
  },
  over_specific: {
    label: "Over-specific",
    detail: "The truth was covered, and scope was added that was never injected.",
    tone: "partial",
  },
  mixed: {
    label: "Mixed",
    detail: "Some dimensions matched while others were missed or added.",
    tone: "partial",
  },
  incorrect: {
    label: "Incorrect",
    detail: "The reported segment contradicts the injected truth.",
    tone: "mismatch",
  },
  inconclusive: {
    label: "Abstained",
    detail: "The runtime declined to assert a cause. Whether that was the right call is assessed below.",
    tone: "partial",
  },
  no_report: {
    label: "No report",
    detail: "The degradation never produced a published investigation.",
    tone: "mismatch",
  },
  ambiguous: {
    label: "Ambiguous",
    detail: "More than one episode could correspond to this trial, so it is not scored.",
    tone: "partial",
  },
};

function seconds(value: number | null | undefined) {
  if (typeof value !== "number") return "Not available";
  if (value < 90) return `${value.toFixed(0)} s`;
  return `${Math.floor(value / 60)} min ${Math.round(value % 60)} s`;
}

function pp(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toFixed(1)} pp` : "Not estimated";
}

const dimensionOrder: DimensionField[] = [
  "merchant",
  "provider",
  "payment_method",
  "country",
  "issuing_bank",
  "canonical_decline_code",
];

export function BlindTrialScoreboard({
  runSpec,
  evaluation,
}: {
  runSpec: ChaosSpec;
  evaluation: BlindTrialEvaluation | null;
}) {
  const score = evaluation ? outcomeCopy[evaluation.outcome] : null;

  const compared = evaluation
    ? dimensionOrder.filter(
        (key) => evaluation.truth_dimensions[key] || evaluation.diagnosed_dimensions[key],
      )
    : [];

  return (
    <section className="chaos-reveal-card" aria-live="polite" aria-label="Blind trial scoreboard">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="eyebrow">Blind trial scoreboard</p>
          <h2 className="mt-1 text-title font-medium text-pharos-ink">
            {score?.label ?? "Injected truth revealed"}
          </h2>
          <p className="mt-2 max-w-2xl text-small leading-6 text-pharos-muted">
            {score?.detail
              ?? "Manual scenarios are visible to the operator from the start, so they are not graded as blind trials."}
          </p>
        </div>
        {score ? (
          <span className={cn("trial-outcome", `trial-outcome-${score.tone}`)}>
            {score.tone === "match" ? (
              <Check className="size-3" aria-hidden="true" />
            ) : score.tone === "mismatch" ? (
              <X className="size-3" aria-hidden="true" />
            ) : (
              <Minus className="size-3" aria-hidden="true" />
            )}
            {evaluation?.outcome.replaceAll("_", " ")}
          </span>
        ) : null}
      </div>

      {evaluation ? (
        <>
          <dl className="trial-metrics">
            <div>
              <dt>Detection</dt>
              <dd>{seconds(evaluation.detection_latency_seconds)}</dd>
              <span>Wall-clock from injection</span>
            </div>
            <div>
              <dt>Explanation</dt>
              <dd>{seconds(evaluation.explanation_latency_seconds)}</dd>
              <span>Wall-clock from injection</span>
            </div>
            <div>
              <dt>Severity error</dt>
              <dd>{pp(evaluation.severity_error_pp)}</dd>
              <span>Injected {pp(evaluation.injected_degradation_pp)} vs estimated</span>
            </div>
            <div>
              <dt>Evidence gate</dt>
              <dd>{evaluation.evidence_audit_status.replaceAll("_", " ")}</dd>
              <span>{evaluation.structural_evidence_valid ? "Structure validated" : "No validated report"}</span>
            </div>
          </dl>

          <div className="mt-6">
            <div className="chaos-compare-header">
              <span>Dimension</span>
              <span>Injected truth</span>
              <span>What was reported</span>
              <span>Assessment</span>
            </div>
            <div className="chaos-compare-list">
              {compared.map((key) => {
                const truth = evaluation.truth_dimensions[key];
                const diagnosed = evaluation.diagnosed_dimensions[key];
                const conflict = evaluation.conflicting_dimensions[key];
                const matched = Boolean(evaluation.matching_dimensions[key]);
                const missing = Boolean(evaluation.missing_dimensions[key]);
                const extra = Boolean(evaluation.extra_dimensions[key]);

                const assessment = conflict
                  ? "Contradiction"
                  : matched
                    ? "Exact match"
                    : missing
                      ? "Omitted"
                      : extra
                        ? "Added scope"
                        : "Not assessed";
                const tone = conflict ? "mismatch" : matched ? "match" : "partial";

                return (
                  <div key={key} className="chaos-compare-row">
                    <strong>{dimensionLabel(key)}</strong>
                    <span>{truth ? dimensionValueLabel(key, truth) : "Not injected"}</span>
                    <span>{diagnosed ? dimensionValueLabel(key, diagnosed) : "Not reported"}</span>
                    <span className={cn("trial-cell", `trial-cell-${tone}`)}>{assessment}</span>
                  </div>
                );
              })}

              <div className="chaos-compare-row">
                <strong>Trial binding</strong>
                <span>{time(runSpec.started_at)} {DISPLAY_TIME_ZONE_LABEL}</span>
                <span>{evaluation.incident_id ? "Bound before reveal" : "No unique episode"}</span>
                <span className="trial-cell trial-cell-match">
                  <LockKeyhole className="size-3" aria-hidden="true" /> Blind-safe
                </span>
              </div>
            </div>
          </div>

          <div className="trial-footer">
            <div>
              <span className="trial-pill">
                <CircleAlert className="size-3.5" aria-hidden="true" /> Human review required
              </span>
              <span className="trial-pill">
                <Check className="size-3.5" aria-hidden="true" /> No action executed
              </span>
              {evaluation.outcome === "inconclusive" ? (
                <span className="trial-pill">
                  <Gauge className="size-3.5" aria-hidden="true" /> Abstention{" "}
                  {evaluation.abstention_assessment.replaceAll("_", " ")}
                </span>
              ) : null}
            </div>
            {evaluation.incident_id ? (
              <Link href={`/incidents/${evaluation.incident_id}`} className="chaos-incident-link">
                <Link2 className="size-3.5" aria-hidden="true" /> Open the report it was scored against
              </Link>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-6">
          <div className="chaos-compare-header">
            <span>Dimension</span>
            <span>Injected truth</span>
            <span>What was reported</span>
            <span>Assessment</span>
          </div>
          <div className="chaos-compare-list">
            {dimensionOrder.map((key) => (
              <div key={key} className="chaos-compare-row">
                <strong>{dimensionLabel(key)}</strong>
                <span>{dimensionValueLabel(key, runSpec.dimensions?.[key]) ?? "Not injected"}</span>
                <span>Not scored</span>
                <span className="trial-cell trial-cell-partial">Operator-defined run</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
