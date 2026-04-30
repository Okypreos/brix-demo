import {
  formatDistanceToNowStrict,
  isToday,
  format,
} from "date-fns";

/**
 * Human-friendly "created N ago" string.
 *
 * - Same day -> "12 minutes ago", "3 hours ago"
 * - Older    -> "Apr 15, 2026"
 *
 * Switches to an absolute date past today because relative dates
 * become hard to scan once you're at "8 days ago" / "3 weeks ago".
 */
export function formatCreatedAgo(epochMs: number) {
  const date = new Date(epochMs);
  if (isToday(date)) {
    return formatDistanceToNowStrict(date, { addSuffix: true });
  }
  return format(date, "MMM d, yyyy");
}
