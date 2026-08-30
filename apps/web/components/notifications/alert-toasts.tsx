"use client";

import Link from "next/link";
import { ChevronRight, TriangleAlert, X } from "lucide-react";
import { useNotifications } from "./notifications-provider";
import { ReportStatusBadge } from "@/components/ui/status";
import { usd } from "@/lib/format";

/**
 * Raised when a new escalated report appears, and persistent until dismissed —
 * an alert that times out on its own is an alert somebody misses.
 *
 * It carries report status and reported impact rather than a severity. Severity
 * lives on Anomaly, which the incident API does not expose, and a tier invented
 * on the client would be exactly the kind of claim this product refuses to make.
 */
/** Two on screen at most. Three simultaneous alerts covered most of the viewport
 *  and stopped reading as alerts; the rest are counted and live in the bell. */
const VISIBLE_TOASTS = 2;

export function AlertToasts() {
  const { toasts, dismissToast, markRead } = useNotifications();
  if (!toasts.length) return null;

  const visible = toasts.slice(0, VISIBLE_TOASTS);
  const overflow = toasts.length - visible.length;

  return (
    <div className="alert-toast-stack" role="region" aria-label="New alerts">
      {overflow > 0 ? (
        <p className="alert-toast-overflow">
          {overflow} more {overflow === 1 ? "alert" : "alerts"} waiting in the bell
        </p>
      ) : null}
      {visible.map((alert) => (
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
              {/* Status only. The human-review flag wrapped to three lines in a
                  column this narrow and pushed the toast past a third of the
                  screen; it belongs on the card and the workspace, where it has
                  room and where the decision is actually made. */}
              <div className="alert-toast-chips">
                <ReportStatusBadge status={alert.status} />
              </div>
            </div>
          </div>

          <p className="alert-toast-summary">{alert.summary}</p>
          <p className="alert-toast-impact">
            {usd(alert.revenueAtRiskPerHour)}/hour reported at risk
            {alert.requiresHumanReview ? " · human review required" : null}
          </p>

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
