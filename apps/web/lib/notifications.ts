import type { IncidentReport, ReportStatus } from "@/lib/contracts";

/**
 * In-app alerting, derived entirely from live incident reports.
 *
 * Two rules mirror the backend so the interface never contradicts it:
 * an alert exists only for a `probable` or `confirmed` report — `inconclusive`
 * is never escalated — and nothing here claims an external message was sent.
 * The frontend has no visibility into Resend or the WhatsApp Cloud API, and it
 * must not pretend otherwise.
 */

export type AlertChannel = "in_app" | "email" | "whatsapp";

/**
 * What the runtime reports about one external alert, mirroring the outbox's own
 * vocabulary. `accepted` means a provider took the message — it is not
 * "delivered", and neither this type nor the API has a word for that, because
 * only a provider delivery callback could justify it.
 *
 * `in_app` never appears here: it is raised by this interface, not dispatched.
 */
export type DispatchState =
  | "queued"
  | "sending"
  | "accepted"
  | "failed"
  | "unknown"
  | "skipped";

export type NotificationDispatch = {
  channel: "email" | "whatsapp";
  state: DispatchState;
  /** ISO 8601. When the runtime last moved this dispatch. */
  updated_at?: string;
  attempt_count?: number;
  /** Provider-side identifier, if the provider returned one. */
  provider_reference?: string | null;
  error_code?: string | null;
};

export type Alert = {
  incidentId: string;
  status: ReportStatus;
  summary: string;
  raisedAt: string;
  revenueAtRiskPerHour: number;
  requiresHumanReview: boolean;
  read: boolean;
};

/** The backend escalates these and only these. */
export const ESCALATED_STATUSES: ReportStatus[] = ["probable", "confirmed"];

export function isEscalated(status: ReportStatus) {
  return ESCALATED_STATUSES.includes(status);
}

export function toAlert(report: IncidentReport, read: boolean): Alert {
  return {
    incidentId: report.incident_id,
    status: report.status,
    summary: report.summary,
    raisedAt: report.generated_at,
    revenueAtRiskPerHour: report.estimated_revenue_loss_usd_per_hour,
    requiresHumanReview: report.requires_human_review,
    read,
  };
}

/* ------------------------------------------------------------------ storage */

/**
 * Only incident ids and switch positions are persisted — never a recipient,
 * a token or anything else that could identify a person.
 */
const SEEN_KEY = "pharos.alerts.seen";
const READ_KEY = "pharos.alerts.read";
const PREFS_KEY = "pharos.alerts.preferences";

function readIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, value: Set<string>) {
  try {
    // Bounded so a long-running demo cannot grow the entry without limit.
    window.localStorage.setItem(key, JSON.stringify([...value].slice(-200)));
  } catch {
    /* storage can be unavailable; alerting still works, it just stops remembering */
  }
}

export const seenStore = {
  read: () => readIdSet(SEEN_KEY),
  write: (value: Set<string>) => writeIdSet(SEEN_KEY, value),
};

export const readStore = {
  read: () => readIdSet(READ_KEY),
  write: (value: Set<string>) => writeIdSet(READ_KEY, value),
};

/* -------------------------------------------------------------- preferences */

export type AlertEvent =
  | "critical_incidents"
  | "confirmed_reports"
  | "investigation_completed"
  | "daily_summary";

export type ChannelPreference = {
  enabled: boolean;
  events: Record<AlertEvent, boolean>;
};

export type AlertPreferences = Record<AlertChannel, ChannelPreference>;

export const alertEvents: Array<{ id: AlertEvent; label: string; detail: string }> = [
  {
    id: "critical_incidents",
    label: "Critical payment incidents",
    detail: "A sustained approval drop has been confirmed and an investigation opened.",
  },
  {
    id: "confirmed_reports",
    label: "Confirmed root-cause reports",
    detail: "The investigator has settled on a cause and cited the evidence for it.",
  },
  {
    id: "investigation_completed",
    label: "Investigation completed",
    detail: "An investigation closed — including when it closed without asserting a cause.",
  },
  {
    id: "daily_summary",
    label: "Daily summary",
    detail: "One digest of the day's incidents, impact and outstanding human decisions.",
  },
];

export const defaultPreferences: AlertPreferences = {
  in_app: {
    enabled: true,
    events: {
      critical_incidents: true,
      confirmed_reports: true,
      investigation_completed: true,
      daily_summary: false,
    },
  },
  email: {
    enabled: true,
    events: {
      critical_incidents: true,
      confirmed_reports: true,
      investigation_completed: false,
      daily_summary: false,
    },
  },
  whatsapp: {
    enabled: true,
    events: {
      critical_incidents: true,
      confirmed_reports: false,
      investigation_completed: false,
      daily_summary: false,
    },
  },
};

export function readPreferences(): AlertPreferences {
  if (typeof window === "undefined") return defaultPreferences;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPreferences;
    const parsed = JSON.parse(raw) as Partial<AlertPreferences>;
    // Merged rather than trusted, so an old or hand-edited entry cannot leave
    // the interface in a shape the components do not expect.
    return {
      in_app: { ...defaultPreferences.in_app, ...parsed.in_app, events: { ...defaultPreferences.in_app.events, ...parsed.in_app?.events } },
      email: { ...defaultPreferences.email, ...parsed.email, events: { ...defaultPreferences.email.events, ...parsed.email?.events } },
      whatsapp: { ...defaultPreferences.whatsapp, ...parsed.whatsapp, events: { ...defaultPreferences.whatsapp.events, ...parsed.whatsapp?.events } },
    };
  } catch {
    return defaultPreferences;
  }
}

export function writePreferences(preferences: AlertPreferences) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  } catch {
    /* preferences are a local convenience; failing to store one is not an error */
  }
}
