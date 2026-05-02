import { z } from "zod";

// Client-side validation for the quote form. Keep in sync with the
// validators in convex/quotes.ts — the server is the security
// boundary, this is just for instant form feedback.
export const quoteFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(120, "Title must be 120 characters or fewer."),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or fewer."),
  customerName: z
    .string()
    .trim()
    .min(1, "Customer name is required.")
    .max(120, "Customer name must be 120 characters or fewer."),
  customerAddress: z
    .string()
    .trim()
    .max(200, "Address must be 200 characters or fewer.")
    .optional(),
  estimatedHours: z
    .number({ message: "Estimated hours is required." })
    .min(0.5, "Must be at least 0.5 hours.")
    .max(24, "Cannot exceed 24 hours.")
    .refine((n) => (n * 2) % 1 === 0, {
      message: "Must be in increments of 0.5 hours.",
    }),
});

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;
