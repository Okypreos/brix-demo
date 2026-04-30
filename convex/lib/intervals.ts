/**
 * Shared half-open interval predicate.
 *
 * Used inside `jobs.assign` and `jobs.reschedule` to reject overlapping
 * windows on the same technician. Half-open `[start, end)` semantics
 * mean back-to-back jobs (one ends at 14:00, next starts at 14:00) do
 * NOT count as overlapping — that's the standard convention for
 * calendar systems and matches what users intuitively expect.
 *
 * Times are epoch milliseconds (the `jobs.start` / `jobs.end` schema
 * type). Pure function, no Convex-specific dependencies, so the same
 * predicate can be reused on the client for an instant "this slot is
 * busy" preview before submission.
 */
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
