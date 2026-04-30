import { format } from "date-fns";

/**
 * Combines a calendar date (Date object whose time portion is ignored)
 * and a "HH:MM" 24-hour string into a single epoch-ms timestamp in the
 * caller's local timezone.
 *
 * Throws if `time` is malformed. The form validates `time` against a
 * regex first, so this function being strict is fine — callers should
 * never see the throw in normal operation.
 */
export function combineDateAndTime(date: Date, time: string): number {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    throw new Error(`Invalid time string: ${time}`);
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  // We construct in local time to match what the user typed. Convex
  // stores everything as UTC epoch-ms anyway, so the difference only
  // matters at the boundary.
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

/**
 * Formats a [start, end) job window as "Mon Apr 30, 2:00pm – 4:00pm".
 * Used in notifications and conflict-error toasts.
 */
export function formatJobWindow(start: number, end: number) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const day = format(startDate, "EEE MMM d");
  const startTime = format(startDate, "h:mma").toLowerCase();
  const endTime = format(endDate, "h:mma").toLowerCase();
  return `${day}, ${startTime} – ${endTime}`;
}

/**
 * Formats a same-day window without the date prefix, for inline display
 * inside a card already labelled with the date: "2:00pm – 4:00pm".
 */
export function formatTimeRange(start: number, end: number) {
  const startTime = format(new Date(start), "h:mma").toLowerCase();
  const endTime = format(new Date(end), "h:mma").toLowerCase();
  return `${startTime} – ${endTime}`;
}
