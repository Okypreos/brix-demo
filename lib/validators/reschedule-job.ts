import { z } from "zod";

// Client-side validation for the reschedule-job form. Same shape as
// assign minus `technicianId` — a job can't be reassigned, only moved.
// Server is the boundary; this just powers instant form feedback.
export const rescheduleJobFormSchema = z.object({
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

export type RescheduleJobFormValues = z.infer<typeof rescheduleJobFormSchema>;
