"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useNotifications } from "./notifications-provider";
import { ReportStatusBadge } from "@/components/ui/status";
import { relativeTime, time, usd, DISPLAY_TIME_ZONE_LABEL } from "@/lib/format";

/**
 * The in-app channel, and the only one this interface can speak for. Everything
 * here is derived from reports the runtime actually returned.
 */
export function NotificationBell() {
  const { alerts, unreadCount, markAllRead, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="notification-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notification-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unreadCount ? `Alerts, ${unreadCount} unread` : "Alerts"}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="size-4" aria-hidden="true" />
        {unreadCount ? <em>{unreadCount > 9 ? "9+" : unreadCount}</em> : null}
      </button>

      {open ? (
        <div className="notification-panel" role="dialog" aria-label="Alerts">
          <div className="notification-panel-head">
            <div>
              <p className="eyebrow">Alerts</p>
              <strong>{unreadCount ? `${unreadCount} unread` : "All caught up"}</strong>
            </div>
            {unreadCount ? (
              <button type="button" onClick={markAllRead} className="notification-mark">
                <CheckCheck className="size-3.5" aria-hidden="true" /> Mark all read
              </button>
            ) : null}
          </div>

          <div className="notification-list">
            {alerts.length ? (
              alerts.slice(0, 8).map((alert) => (
                <Link
                  key={alert.incidentId}
                  href={`/incidents/${alert.incidentId}`}
                  className={alert.read ? "notification-item" : "notification-item notification-item-unread"}
                  onClick={() => {
                    markRead(alert.incidentId);
                    setOpen(false);
                  }}
                >
                  <div className="notification-item-top">
                    <ReportStatusBadge status={alert.status} />
                    <time dateTime={alert.raisedAt} title={`${time(alert.raisedAt)} ${DISPLAY_TIME_ZONE_LABEL}`}>
                      {relativeTime(alert.raisedAt)}
                    </time>
                  </div>
                  <p>{alert.summary}</p>
                  <span className="notification-item-foot">
                    {usd(alert.revenueAtRiskPerHour)}/hr reported at risk
                    <ChevronRight className="size-3" aria-hidden="true" />
                  </span>
                </Link>
              ))
            ) : (
              <p className="notification-empty">
                No alert has been raised. The runtime escalates a report only once it settles on a
                probable or confirmed cause — an inconclusive investigation never becomes an alert.
              </p>
            )}
          </div>

          <Link href="/settings" className="notification-panel-foot" onClick={() => setOpen(false)}>
            <SlidersHorizontal className="size-3.5" aria-hidden="true" /> Alert routing
          </Link>
        </div>
      ) : null}
    </div>
  );
}
