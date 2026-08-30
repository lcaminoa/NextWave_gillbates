"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useIncidentReports } from "@/lib/api/use-control-tower";
import type { RuntimeStatus } from "@/components/ui/status";
import { isEscalated, readStore, seenStore, toAlert, type Alert } from "@/lib/notifications";

type NotificationsValue = {
  alerts: Alert[];
  unreadCount: number;
  /** Alerts that arrived in this session and have not been dismissed from screen. */
  toasts: Alert[];
  runtimeStatus: RuntimeStatus;
  openCaseCount: number;
  markRead: (incidentId: string) => void;
  markAllRead: () => void;
  dismissToast: (incidentId: string) => void;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * One poller for the whole shell. The bell, the toast stack and the panel all
 * read from here rather than each opening their own interval against
 * GET /api/incidents.
 *
 * Alerts are derived from live reports — nothing is seeded or simulated — and
 * only from the statuses the backend actually escalates.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { reports, status } = useIncidentReports();
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [toastIds, setToastIds] = useState<string[]>([]);
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // Read state lives in localStorage, which the server cannot see. Restoring it
    // in a transition keeps the first paint identical to the server's and matches
    // how the Chaos console restores its own run.
    seenRef.current = seenStore.read();
    const stored = readStore.read();
    startTransition(() => setReadIds(stored));
  }, []);

  const escalated = useMemo(
    () => reports.filter((report) => isEscalated(report.status)),
    [reports],
  );

  useEffect(() => {
    const seen = seenRef.current;
    if (!seen || status !== "live") return;

    const arrived = escalated.filter((report) => !seen.has(report.incident_id));
    if (!arrived.length) return;

    // First successful poll of a session only records what is already open. A
    // wall of toasts for incidents that were raised hours ago is noise, not news.
    const isFirstSync = seen.size === 0 && escalated.length === arrived.length;
    for (const report of arrived) seen.add(report.incident_id);
    seenStore.write(seen);

    if (!isFirstSync) {
      setToastIds((current) => [
        ...arrived.map((report) => report.incident_id).filter((id) => !current.includes(id)),
        ...current,
      ]);
    }
  }, [escalated, status]);

  const markRead = useCallback((incidentId: string) => {
    setReadIds((current) => {
      if (current.has(incidentId)) return current;
      const next = new Set(current);
      next.add(incidentId);
      readStore.write(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds(() => {
      const next = new Set(escalated.map((report) => report.incident_id));
      readStore.write(next);
      return next;
    });
  }, [escalated]);

  const dismissToast = useCallback((incidentId: string) => {
    setToastIds((current) => current.filter((id) => id !== incidentId));
  }, []);

  const alerts = useMemo(
    () =>
      [...escalated]
        .sort((left, right) => right.generated_at.localeCompare(left.generated_at))
        .map((report) => toAlert(report, readIds.has(report.incident_id))),
    [escalated, readIds],
  );

  const value = useMemo<NotificationsValue>(
    () => ({
      alerts,
      unreadCount: alerts.filter((alert) => !alert.read).length,
      toasts: toastIds
        .map((id) => alerts.find((alert) => alert.incidentId === id))
        .filter((alert): alert is Alert => Boolean(alert)),
      runtimeStatus: status,
      openCaseCount: reports.length,
      markRead,
      markAllRead,
      dismissToast,
    }),
    [alerts, toastIds, status, reports.length, markRead, markAllRead, dismissToast],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications must be used inside NotificationsProvider");
  return value;
}
