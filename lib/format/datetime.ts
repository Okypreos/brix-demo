import { format, formatDistanceToNow } from "date-fns";

// Date (time portion ignored) + "HH:MM" -> epoch ms in local time.
// Throws on malformed time; the form regex catches this upstream.
export function combineDateAndTime(date: Date, time: string): number {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    throw new Error(`Invalid time string: ${time}`);
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  // Local time so the user sees what they typed. Convex stores epoch
  // ms; the timezone only matters at the form/server boundary.
  const combined = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
  );
  return combined.getTime();
}

// "Mon Apr 30, 2:00pm – 4:00pm". Used in conflict toasts and notifs.
export function formatJobWindow(start: number, end: number) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const day = format(startDate, "EEE MMM d");
  const startTime = format(startDate, "h:mma").toLowerCase();
  const endTime = format(endDate, "h:mma").toLowerCase();
  return `${day}, ${startTime} – ${endTime}`;
}

// Same-day window without the date prefix: "2:00pm – 4:00pm".
export function formatTimeRange(start: number, end: number) {
  const startTime = format(new Date(start), "h:mma").toLowerCase();
  const endTime = format(new Date(end), "h:mma").toLowerCase();
  return `${startTime} – ${endTime}`;
}

// "5 minutes ago" / "just now" for recent events. We override <30s
// since date-fns's "less than a minute ago" is wordy.
export function formatRelativeTime(epochMs: number) {
  const diffMs = Date.now() - epochMs;
  if (diffMs < 30_000) return "just now";
  return formatDistanceToNow(new Date(epochMs), { addSuffix: true });
}
