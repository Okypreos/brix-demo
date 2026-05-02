// Half-open `[start, end)` overlap. Back-to-back jobs (one ends 14:00,
// next starts 14:00) don't count as overlapping. Times are epoch ms.
// Pure function so the same predicate runs on the client too.
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
