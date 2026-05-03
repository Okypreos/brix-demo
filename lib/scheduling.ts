// Shared time-picker primitives used by the assign and reschedule
// forms. Kept in plain TypeScript (no React) so any future client or
// server preview can reuse them.

// Half-hour options between startHour and endHour (inclusive of
// start, exclusive of end). 06:00 -> 20:00 gives 28 business-hours
// slots — enough coverage without overwhelming the dropdown.
export function buildTimeOptions(startHour = 6, endHour = 20): string[] {
  const options: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 30]) {
      options.push(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
      );
    }
  }
  return options;
}

export const TIME_OPTIONS = buildTimeOptions();

// "08:30" -> "8:30am". Display-only.
export function formatTimeOption(time: string): string {
  const [hh, mm] = time.split(":");
  const hour = Number.parseInt(hh, 10);
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${mm}${period}`;
}

export const DURATION_OPTIONS = [0.5, 1, 1.5, 2, 3, 4, 6, 8] as const;

// 0.5 -> "30 min", 1 -> "1 hour", 2.5 -> "2.5 hours".
export function formatDurationOption(hours: number): string {
  if (hours < 1) return `${hours * 60} min`;
  if (hours === 1) return "1 hour";
  return `${hours} hours`;
}

// Snap up to the nearest dropdown option so the seeded default
// matches a real choice (5h estimate -> 6h shown).
export function defaultDuration(estimatedHours: number): number {
  const fromList = DURATION_OPTIONS.find((d) => d >= estimatedHours);
  return fromList ?? DURATION_OPTIONS[DURATION_OPTIONS.length - 1];
}

// Next (date, "HH:mm") slot strictly after `now + bufferMs`. If today
// is exhausted, rolls forward to tomorrow's first slot.
//
// 60s buffer keeps the displayed default visibly in the future. The
// real "no past start" check is server-side in validateWindow.
export function nextAvailableSlot(
  now: Date = new Date(),
  bufferMs = 60_000,
): { date: Date; startTime: string } {
  const threshold = now.getTime() + bufferMs;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  for (const option of TIME_OPTIONS) {
    const [hh, mm] = option.split(":");
    const candidate = new Date(today);
    candidate.setHours(Number.parseInt(hh, 10), Number.parseInt(mm, 10), 0, 0);
    if (candidate.getTime() > threshold) {
      return { date: today, startTime: option };
    }
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: tomorrow, startTime: TIME_OPTIONS[0] };
}

// Splits an epoch ms into a (date with time stripped, "HH:mm") pair
// for pre-filling the reschedule form. Inverse of `combineDateAndTime`.
//
// Snaps the time string to the nearest entry in TIME_OPTIONS so the
// Select shows a valid choice — a job at 14:23 (created via a custom
// dialog) would otherwise show no selection.
export function splitEpochMsForForm(epochMs: number): {
  date: Date;
  startTime: string;
} {
  const d = new Date(epochMs);
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes() < 30 ? "00" : "30";
  const candidate = `${hh}:${mm}`;
  return {
    date,
    startTime: TIME_OPTIONS.includes(candidate) ? candidate : TIME_OPTIONS[0],
  };
}
