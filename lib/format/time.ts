import {
  formatDistanceToNowStrict,
  isToday,
  format,
} from "date-fns";

// "12 minutes ago" today, "Apr 15, 2026" once it's older. Relative
// dates get hard to scan past a day or two.
export function formatCreatedAgo(epochMs: number) {
  const date = new Date(epochMs);
  if (isToday(date)) {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  }
  return format(date, "MMM d, yyyy");
}
