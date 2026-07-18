import {
  formatUtcTimestamp,
  formatZonedTimestamp,
} from "../../src/infra/format-time/format-datetime.js";

export { escapeRegExp } from "../../src/utils.js";

type EnvelopeTimestampZone = string;

// Mirrors formatEnvelopeTimestamp in src/auto-reply/envelope.ts, which renders
// seconds as of upstream v2026.5.28 — keep displaySeconds in sync with it or
// every envelope-header assertion drifts by the seconds field.
export function formatEnvelopeTimestamp(date: Date, zone: EnvelopeTimestampZone = "utc"): string {
  const trimmedZone = zone.trim();
  const normalized = trimmedZone.toLowerCase();
  const weekday = (() => {
    try {
      if (normalized === "utc" || normalized === "gmt") {
        return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(date);
      }
      if (normalized === "local" || normalized === "host") {
        return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
      }
      return new Intl.DateTimeFormat("en-US", { timeZone: trimmedZone, weekday: "short" }).format(
        date,
      );
    } catch {
      return undefined;
    }
  })();

  if (normalized === "utc" || normalized === "gmt") {
    const ts = formatUtcTimestamp(date, { displaySeconds: true });
    return weekday ? `${weekday} ${ts}` : ts;
  }
  if (normalized === "local" || normalized === "host") {
    const ts =
      formatZonedTimestamp(date, { displaySeconds: true }) ??
      formatUtcTimestamp(date, { displaySeconds: true });
    return weekday ? `${weekday} ${ts}` : ts;
  }
  const ts =
    formatZonedTimestamp(date, { timeZone: trimmedZone, displaySeconds: true }) ??
    formatUtcTimestamp(date, { displaySeconds: true });
  return weekday ? `${weekday} ${ts}` : ts;
}

export function formatLocalEnvelopeTimestamp(date: Date): string {
  return formatEnvelopeTimestamp(date, "local");
}
