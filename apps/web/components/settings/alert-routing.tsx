"use client";

import { startTransition, useEffect, useState } from "react";
import { Bell, Lock, Mail, MessageCircle } from "lucide-react";
import {
  alertEvents,
  defaultPreferences,
  readPreferences,
  writePreferences,
  type AlertChannel,
  type AlertEvent,
  type AlertPreferences,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

/**
 * Alert routing.
 *
 * Every switch here is a local interface preference. There is no authentication
 * and no per-user store, so nothing on this screen changes what the runtime
 * actually sends — and the page says that in plain words rather than implying a
 * connection it does not have. Only the switch positions are persisted, in
 * localStorage; no recipient, address or token is stored, because none of them
 * ever reaches the browser.
 */

const channels: Array<{
  id: AlertChannel;
  label: string;
  icon: typeof Mail;
  purpose: string;
  state: { label: string; tone: string };
  note?: string;
}> = [
  {
    id: "in_app",
    label: "In-app alerts",
    icon: Bell,
    purpose:
      "Best for whoever is watching the Control Room live. Raised the moment a report appears, and independent of email or WhatsApp.",
    state: { label: "Active", tone: "routing-state-good" },
  },
  {
    id: "email",
    label: "Email alerts",
    icon: Mail,
    purpose:
      "Best for evidence. Carries the cited claims, the impact and a link back to the investigation, and survives as a record.",
    state: { label: "Configured on the server", tone: "routing-state-good" },
  },
  {
    id: "whatsapp",
    label: "WhatsApp alerts",
    icon: MessageCircle,
    purpose:
      "Best for urgency. Short and operational, for the person who has to make the call away from a screen.",
    state: { label: "Configured on the server", tone: "routing-state-good" },
    note: "For demo use, replies open the active messaging window. Production alerts require recipient consent and may require approved templates.",
  },
];

export function AlertRouting() {
  const [preferences, setPreferences] = useState<AlertPreferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Same reason as the provider: the stored switch positions are invisible to
    // the server, so they are applied after hydration rather than during it.
    const stored = readPreferences();
    startTransition(() => {
      setPreferences(stored);
      setHydrated(true);
    });
  }, []);

  const update = (next: AlertPreferences) => {
    setPreferences(next);
    writePreferences(next);
  };

  const toggleChannel = (channel: AlertChannel) =>
    update({
      ...preferences,
      [channel]: { ...preferences[channel], enabled: !preferences[channel].enabled },
    });

  const toggleEvent = (channel: AlertChannel, event: AlertEvent) =>
    update({
      ...preferences,
      [channel]: {
        ...preferences[channel],
        events: { ...preferences[channel].events, [event]: !preferences[channel].events[event] },
      },
    });

  return (
    <section className="mt-4" aria-labelledby="routing-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1 pb-3">
        <div>
          <p className="eyebrow">Alert routing</p>
          <h2 id="routing-heading" className="mt-1 text-title font-medium text-pharos-ink">
            Which channel carries what
          </h2>
        </div>
        <span className="routing-demo-flag">Demo preferences — server-side routing will be connected next</span>
      </div>

      <div className="routing-grid">
        {channels.map((channel) => {
          const Icon = channel.icon;
          const preference = preferences[channel.id];

          return (
            <article
              key={channel.id}
              className={cn("routing-card", !preference.enabled && "routing-card-off")}
            >
              <div className="routing-card-head">
                <span className="routing-card-icon">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <strong>{channel.label}</strong>
                  <span className={cn("routing-state", channel.state.tone)}>{channel.state.label}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preference.enabled}
                  aria-label={`${channel.label} — ${preference.enabled ? "on" : "off"}`}
                  onClick={() => toggleChannel(channel.id)}
                  className={cn("routing-switch", preference.enabled && "routing-switch-on")}
                  disabled={!hydrated}
                >
                  <i />
                </button>
              </div>

              <p className="routing-purpose">{channel.purpose}</p>

              {/* No masked address is shown because none exists to mask: the
                  recipient is held in the runtime's environment and is never sent
                  to the browser. Inventing a plausible-looking one would be worse
                  than showing nothing. */}
              <p className="routing-recipient">
                <Lock className="size-3" aria-hidden="true" />
                {channel.id === "in_app"
                  ? "This browser session"
                  : "Recipient held on the server — never sent to this interface"}
              </p>

              <fieldset className="routing-events" disabled={!preference.enabled}>
                <legend>What do you want to receive?</legend>
                {alertEvents.map((event) => (
                  <label key={event.id} className="routing-event">
                    <input
                      type="checkbox"
                      checked={preference.events[event.id]}
                      onChange={() => toggleEvent(channel.id, event.id)}
                    />
                    <span>
                      <strong>{event.label}</strong>
                      <small>{event.detail}</small>
                    </span>
                  </label>
                ))}
              </fieldset>

              {channel.note ? <p className="routing-note">{channel.note}</p> : null}
            </article>
          );
        })}
      </div>

      <p className="routing-footnote">
        The runtime escalates by email and WhatsApp only for reports it settles as{" "}
        <strong>probable</strong> or <strong>confirmed</strong>. An inconclusive investigation is
        never sent as an alert, whatever these switches say — an open question is not an alarm.
      </p>
    </section>
  );
}
