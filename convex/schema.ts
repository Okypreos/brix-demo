import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Data model.
//
// Users (managers + technicians) share one table with a `role` field.
// Quotes describe work; transition unscheduled -> scheduled (when a Job
// is created) -> completed (when the Job is marked done). Jobs assign a
// Quote to a technician for a window [start, end). Notifications are
// written inside the same mutation that triggers them; recipient is a
// single `users` FK regardless of role.

export const QUOTE_STATUSES = ["unscheduled", "scheduled", "completed"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const JOB_STATUSES = ["scheduled", "completed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const USER_ROLES = ["manager", "technician"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const NOTIFICATION_KINDS = [
  "job_assigned",
  "job_updated",
  "job_completed",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export default defineSchema({
  users: defineTable({
    // `{issuer}|{subject}` — the canonical Convex identity string.
    tokenIdentifier: v.string(),
    // The Clerk subject ("user_xxx"). We look up by this on every
    // authenticated call.
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    // Defaults to "technician" on first sign-up. Promotion is an
    // explicit server-side op (`users.promoteToManager`) so users
    // can't self-elevate via Clerk metadata.
    role: v.union(v.literal("manager"), v.literal("technician")),
    color: v.optional(v.string()),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_id", ["clerkId"])
    .index("by_role", ["role"]),

  quotes: defineTable({
    title: v.string(),
    description: v.string(),
    customerName: v.string(),
    customerAddress: v.optional(v.string()),
    estimatedHours: v.number(),
    status: v.union(
      v.literal("unscheduled"),
      v.literal("scheduled"),
      v.literal("completed"),
    ),
    createdByManagerId: v.id("users"),
  })
    .index("by_status", ["status"])
    .index("by_manager", ["createdByManagerId"]),

  jobs: defineTable({
    quoteId: v.id("quotes"),
    technicianId: v.id("users"),
    managerId: v.id("users"),
    // Both epoch ms. Half-open [start, end) — adjacent jobs don't
    // count as overlapping.
    start: v.number(),
    end: v.number(),
    status: v.union(v.literal("scheduled"), v.literal("completed")),
    completedAt: v.optional(v.number()),
  })
    // Critical for the overlap check in `jobs.assign`. Narrowing on
    // technicianId means assigns to *different* techs don't contend.
    // See https://stack.convex.dev/high-throughput-mutations-via-precise-queries
    .index("by_technicianId_and_start", ["technicianId", "start"])
    .index("by_technicianId_and_status", ["technicianId", "status"])
    .index("by_quoteId", ["quoteId"])
    .index("by_managerId", ["managerId"]),

  notifications: defineTable({
    recipientId: v.id("users"),
    kind: v.union(
      v.literal("job_assigned"),
      v.literal("job_updated"),
      v.literal("job_completed"),
    ),
    jobId: v.id("jobs"),
    message: v.string(),
    // Missing => unread. We write an epoch-ms read time on ack.
    readAt: v.optional(v.number()),
  })
    // `.eq("recipientId", me).eq("readAt", undefined)` for the bell.
    .index("by_recipientId_and_readAt", ["recipientId", "readAt"])
    .index("by_recipientId", ["recipientId"]),
});
