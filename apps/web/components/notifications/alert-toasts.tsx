"use client";

import Link from "next/link";
import { ChevronRight, TriangleAlert, X } from "lucide-react";
import { useNotifications } from "./notifications-provider";
import { HumanReviewChip, ReportStatusBadge } from "@/components/ui/status";
import { usd } from "@/lib/format";

/**
 * Raised when a new escalated report appears, and persistent until dismissed —
 * an alert that times out on its own is an alert somebody misses.
 *
 * It carries report status and reported impact rather than a severity. Severity
 * lives on Anomaly, which the incident API does not expose, and a tier invented
 * on the client would be exactly the kind of claim this product refuses to make.
 */
export function AlertToasts() {
  const { toasts, dismissToast, markRead } = useNotifications();
  if (!toasts.length) return null;

  return (
    <div className="alert-toast-stack" role="region" aria-label="New alerts">
      {toasts.slice(0, 3).map((alert) => (
        <article key={alert.incidentId} className="alert-toast" aria-live="polite">
          <button
            type="button"
            className="alert-toast-dismiss"
            aria-label="Dismiss alert"
            onClick={() => dismissToast(alert.incidentId)}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>

          <div className="alert-toast-head">
            <span className="alert-toast-icon">
              <TriangleAlert className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">Payment incident escalated</p>
              <div className="alert-toast-chips">
                <ReportStatusBadge status={alert.status} />
                {alert.requiresHumanReview ? <HumanReviewChip required /> : null}
              </div>
            </div>
          </div>

          <p className="alert-toast-summary">{alert.summary}</p>
          <p className="alert-toast-impact">{usd(alert.revenueAtRiskPerHour)}/hour reported at risk</p>

          <Link
            href={`/incidents/${alert.incidentId}`}
            className="alert-toast-cta"
            onClick={() => {
              markRead(alert.incidentId);
              dismissToast(alert.incidentId);
            }}
          >
            Open investigation <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </article>
      ))}
    </div>
  );
}
