"use client";

import { useState } from "react";
import { Bell, CircleAlert, CircleSlash, Clock3, Eye, Mail, MessageCircle, Send } from "lucide-react";
import type { ReportStatus } from "@/lib/contracts";
import { isEscalated, type AlertChannel, type DispatchState, type NotificationDispatch } from "@/lib/notifications";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Where an incident's alert went, per channel.
 *
 * The honest position today: the in-app channel is the only one this interface
 * can speak for, because it raised that alert itself. Email and WhatsApp are
 * sent by the runtime through Resend and the WhatsApp Cloud API, and the
 * incident endpoint does not report what happened to them — so this panel says
 * so, rather than showing a green tick it has no basis for.
 *
 * The day the runtime includes `notification_dispatches` on the incident detail
 * response, this component renders it with no further change. It reads the field
 * defensively instead of widening a shared type, so nothing in contracts/ or in
 * the API adapter has to move to make that work.
 */

const stateMeta: Record<DispatchState, { label: string; icon: typeof Send; tone: string }> = {
  queued: { label: "Queued", icon: Clock3, tone: "delivery-state-neutral" },
  sending: { label: "Sending", icon: Send, tone: "delivery-state-active" },
  // Deliberately not "Delivered": the provider accepting a message is not the
  // same claim as it reaching a person, and only the provider can make the second.
  accepted: { label: "Accepted by provider", icon: Bell, tone: "delivery-state-good" },
  failed: { label: "Failed", icon: CircleAlert, tone: "delivery-state-bad" },
  not_configured: { label: "Not configured", icon: CircleSlash, tone: "delivery-state-neutral" },
};

const channelMeta: Record<AlertChannel, { label: string; icon: typeof Mail; role: string }> = {
  in_app: { label: "In-app", icon: Bell, role: "For whoever is watching the Control Room live." },
  email: { label: "Email", icon: Mail, role: "Carries the evidence and a link back to the investigation." },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, role: "Short, urgent, for the person who has to decide." },
};

/** Illustrative only — used by the preview switch, never mixed with real data. */
const previewDispatches: NotificationDispatch[] = [
  { channel: "email", state: "accepted", provider_reference: "resend:re_2f…", updated_at: new Date().toISOString() },
  { channel: "whatsapp", state: "sending", updated_at: new Date().toISOString() },
];

export function AlertDelivery({
  status,
  raisedInApp,
  raisedAt,
  dispatches,
}: {
  status: ReportStatus;
  /** True when this interface raised an in-app alert for this incident. */
  raisedInApp: boolean;
  raisedAt: string;
  dispatches?: NotificationDispatch[];
}) {
  const [preview, setPreview] = useState(false);
  const escalated = isEscalated(status);
  const live = dispatches?.length ? dispatches : undefined;
  const shown = live ?? (preview ? previewDispatches : undefined);

  const find = (channel: AlertChannel) => shown?.find((dispatch) => dispatch.channel === channel);

  return (
    <article className="incident-workspace-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Alert delivery</p>
          <h2 className="mt-1 text-title font-medium text-pharos-ink">Who was told, and how</h2>
        </div>
        {!live ? (
          <button
            type="button"
            onClick={() => setPreview((value) => !value)}
            aria-pressed={preview}
            className="delivery-preview-toggle"
          >
            <Eye className="size-3.5" aria-hidden="true" />
            {preview ? "Hide preview states" : "Preview states"}
          </button>
        ) : null}
      </div>

      {!escalated ? (
        <p className="mt-4 text-small leading-6 text-pharos-muted">
          This report is <strong className="text-signal-uncertain">inconclusive</strong>, so no external
          alert was raised for it. The runtime escalates by email and WhatsApp only once an
          investigation settles on a probable or confirmed cause — an open question is not an alarm.
        </p>
      ) : null}

      <div className="delivery-grid mt-5">
        {(Object.keys(channelMeta) as AlertChannel[]).map((channel) => {
          const meta = channelMeta[channel];
          const Icon = meta.icon;

          // In-app is the one channel the interface has first-hand knowledge of.
          const inAppState = raisedInApp ? "raised" : escalated ? "pending" : "skipped";
          const dispatch = channel === "in_app" ? undefined : find(channel);
          const state = dispatch ? stateMeta[dispatch.state] : undefined;
          const StateIcon = state?.icon;

          return (
            <div key={channel} className="delivery-channel">
              <div className="delivery-channel-head">
                <span className="delivery-channel-icon">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <strong>{meta.label}</strong>
              </div>

              {channel === "in_app" ? (
                <span
                  className={cn(
                    "delivery-state",
                    inAppState === "raised" ? "delivery-state-good" : "delivery-state-neutral",
                  )}
                >
                  <Bell className="size-3" aria-hidden="true" />
                  {inAppState === "raised"
                    ? "Raised in this browser"
                    : inAppState === "pending"
                      ? "Not raised in this session"
                      : "Not escalated"}
                </span>
              ) : state && StateIcon ? (
                <span className={cn("delivery-state", state.tone)}>
                  <StateIcon className="size-3" aria-hidden="true" />
                  {state.label}
                </span>
              ) : (
                <span className="delivery-state delivery-state-unknown">
                  <CircleAlert className="size-3" aria-hidden="true" />
                  {escalated ? "Not reported by the runtime" : "Not escalated"}
                </span>
              )}

              <p className="delivery-channel-role">{meta.role}</p>

              {channel === "in_app" && raisedInApp ? (
                <p className="delivery-channel-meta">{relativeTime(raisedAt)}</p>
              ) : null}
              {dispatch?.provider_reference ? (
                <p className="delivery-channel-meta font-mono">{dispatch.provider_reference}</p>
              ) : null}
              {dispatch?.detail ? <p className="delivery-channel-meta">{dispatch.detail}</p> : null}
            </div>
          );
        })}
      </div>

      {live ? null : preview ? (
        <p className="delivery-note delivery-note-preview">
          <strong>Preview — not live.</strong> These are the states this panel will show once the
          runtime reports them. Nothing here reflects a real send.
        </p>
      ) : (
        <p className="delivery-note">
          Email and WhatsApp are sent server-side by the runtime; the credentials never reach this
          interface. The incident endpoint does not yet report what became of those sends, so this
          panel shows nothing for them rather than guessing.
        </p>
      )}
    </article>
  );
}
