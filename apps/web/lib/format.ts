/**
 * Presentation helpers. Every number the product shows carries a unit, and every
 * unit is spelled out here once so the screens cannot drift apart.
 */

/** The clock the demo narrates in. Surfaced in the UI so a timestamp is never ambiguous. */
export const DISPLAY_TIME_ZONE = "America/Sao_Paulo";
export const DISPLAY_TIME_ZONE_LABEL = "BRT";

export function percent(value: number, digits = 1) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function usd(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

/** Revenue figures are always a rate in the contract, never an accumulated total. */
export function usdPerHour(value: number) {
  return `${usd(value)}/hour`;
}

export function integer(value: number) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function time(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}

/** "4 min ago" — keeps a live surface legible without a second clock on screen. */
export function relativeTime(value: string, now = Date.now()) {
  const elapsedMs = now - new Date(value).getTime();
  if (!Number.isFinite(elapsedMs)) return "—";
  const minutes = Math.round(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Signed percentage-point delta between two 0-1 rates. */
export function deltaPp(current: number, expected: number) {
  const delta = (current - expected) * 100;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`;
}

/**
 * Approval delta implied by a candidate's decline rates. A decline rate going up
 * is an approval rate going down, so the sign is inverted on purpose.
 */
export function approvalDeltaPp(baselineDeclineRate: number, currentDeclineRate: number) {
  return deltaPp(1 - currentDeclineRate, 1 - baselineDeclineRate);
}

/** Transactions observed per minute across a set of timestamps. Null when the sample is too thin. */
export function ratePerMinute(count: number, spanMs: number) {
  if (count < 2 || spanMs <= 0) return null;
  return (count / spanMs) * 60_000;
}
