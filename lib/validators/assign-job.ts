import { z } from "zod";

// Client-side validation for the assign-job form. Mirrors the server
// checks in convex/jobs.ts:validateWindow — the server is the security
// boundary, this is just for instant form feedback.
//
// `technicianId` is a Convex Id but treated as an opaque string here;
// the server validates it.
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
