"use client";

import { Check, CircleAlert, Minus, ShieldCheck, ShieldOff, ShieldQuestion, X } from "lucide-react";
import type { EvidenceAuditView } from "@/lib/api/control-tower";
import { cn } from "@/lib/utils";

/**
 * The publication gate, shown as what it was rather than as a badge.
 *
 * The seal reports a decision the runtime actually made before publishing: the
 * Evidence Auditor either approved the draft, rejected it, failed, or never ran.
 * It is not a score computed here from the report's contents — that would be the
 * interface grading its own homework.
 *
 * `not_run` is the deterministic investigator, and it can never read as verified.
 * A rejection is not hidden either: it opens by default, because the interesting
 * case for anyone assessing this product is the one where publication was
 * withheld.
 */

const statusMeta = {
  approved: {
    icon: ShieldCheck,
    tone: "audit-approved",
    title: "PHAROS VERIFIED",
    abstained: "Verified safe abstention",
  },
  rejected: {
    icon: ShieldOff,
    tone: "audit-rejected",
    title: "Publication withheld",
    abstained: "Publication withheld",
  },
  error: {
    icon: CircleAlert,
    tone: "audit-error",
    title: "Audit could not complete",
    abstained: "Audit could not complete",
  },
  not_run: {
    icon: ShieldQuestion,
    tone: "audit-not-run",
    title: "Independent audit not run",
    abstained: "Independent audit not run",
  },
} as const;

const checkIcon = { pass: Check, fail: X, not_applicable: Minus } as const;

export function EvidenceAuditSeal({
  audit,
  inconclusive,
}: {
  audit?: EvidenceAuditView | null;
  inconclusive: boolean;
}) {
  // A runtime that never sent the gate is not the same claim as a gate that did
  // not run: the first is a silence we cannot interpret, the second is a result.
  // Reading the missing one as `not_run` would be this screen asserting
  // something the runtime never said, so it gets its own honest state.
  if (!audit) {
    return (
      <div className={cn("audit-seal", "audit-not-run")}>
        <div className="audit-seal-summary cursor-default">
          <span className="audit-seal-icon">
            <ShieldQuestion className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Evidence audit seal</p>
            <strong>Audit not reported</strong>
            <p className="audit-seal-line">
              This runtime answered without an audit result, so none is shown. Nothing is inferred
              from its absence — it is not a pass, and not a rejection.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const meta = statusMeta[audit.status];
  const Icon = meta.icon;
  // An approved run only needs to show what passed; anything else is being
  // examined, so every check stays on screen.
  const checks = audit.status === "approved" ? audit.checks.filter((check) => check.status === "pass") : audit.checks;

  return (
    <details
      className={cn("audit-seal", meta.tone)}
      open={audit.status === "rejected" || audit.status === "error"}
    >
      <summary className="audit-seal-summary">
        <span className="audit-seal-icon">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">Evidence audit seal</p>
          <strong>{inconclusive ? meta.abstained : meta.title}</strong>
          <p className="audit-seal-line">{audit.summary}</p>
        </div>
        <span className="audit-seal-expand" aria-hidden="true">
          Open audit
        </span>
      </summary>

      <div className="audit-seal-body">
        <dl className="audit-seal-stats">
          <div>
            <dt>Claims reviewed</dt>
            <dd>{audit.claims_reviewed}</dd>
          </div>
          <div>
            <dt>Evidence reviewed</dt>
            <dd>{audit.evidence_reviewed}</dd>
          </div>
          <div>
            <dt>Publication state</dt>
            <dd>{audit.status.replaceAll("_", " ")}</dd>
          </div>
        </dl>

        {checks.length ? (
          <div className="audit-seal-checks">
            {checks.map((check) => {
              const CheckIcon = checkIcon[check.status];
              return (
                <div key={check.code} className={cn("audit-check", `audit-check-${check.status}`)}>
                  <span>
                    <CheckIcon className="size-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {audit.issues.length ? (
          <div className="audit-seal-issues">
            <p className="eyebrow">Why publication was withheld</p>
            {audit.issues.map((issue, index) => (
              <div key={`${issue.code}-${index}`}>
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>
                  <strong>{issue.code.replaceAll("_", " ")}</strong>
                  {issue.message}
                  {issue.evidence_ids.length ? (
                    <span className="font-mono">Evidence: {issue.evidence_ids.join(", ")}</span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Both are guaranteed by the response type itself, not asserted here. */}
        <div className="audit-seal-guarantees">
          <span>
            <CircleAlert className="size-3.5" aria-hidden="true" /> Human review required
          </span>
          <span>
            <ShieldCheck className="size-3.5" aria-hidden="true" /> No action executed
          </span>
        </div>
      </div>
    </details>
  );
}
