import { z } from "zod";

/**
 * Client-side validation for the "assign quote → job" form.
 *
 * Mirrors the server-side checks in `convex/jobs.ts:validateWindow`.
 * The server is authoritative — this exists only to give the user
 * instant feedback in the form. Notably:
 *  - `technicianId` is a Convex Id, but we treat it as an opaque
 *    string here: zod can't validate it, the server does.
 *  - `date` is a JS Date with the time portion ignored.
 *  - `startTime` is "HH:MM" 24-hour.
 *  - `durationHours` is in 0.5-h increments, 0.5–24h.
 */
export const assignJobFormSchema = z.object({
  technicianId: z.string().min(1, "Pick a technician."),
  date: z.date({ message: "Pick a date." }),
  startTime: z
    .string()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Pick a start time."),
  durationHours: z
    .number({ message: "Pick a duration." })
    .min(0.5, "Must be at least 0.5 hours.")
    .max(24, "Cannot exceed 24 hours.")
    .refine((n) => (n * 2) % 1 === 0, {
      message: "Must be in 0.5-hour increments.",
    }),
});

export type AssignJobFormValues = z.infer<typeof assignJobFormSchema>;
