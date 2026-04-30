import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * App data model.
 *
 * - Managers and Technicians are modeled as two separate tables. Each has
 *   its own auth row mirrored from Clerk on first authenticated request
 *   (see `convex/users.ts:ensureCurrentUser`). Keeping them separate gives
 *   us compile-time FK safety: `Id<"technicians">` and `Id<"managers">`
 *   are distinct types, so an `assign` mutation literally cannot mix them
 *   up.
 *
 * - A Quote describes work to be done; it has no time and no technician.
 *   It transitions unscheduled -> scheduled (when a Job is created from it)
 *   -> completed (when its Job is marked complete by the technician).
 *
 * - A Job is the assignment of a Quote to a Technician for a specific time
 *   window [start, end). Conflict prevention (no overlapping jobs for the
 *   same technician) is enforced inside the `jobs.assign` mutation using
 *   the `by_technicianId_and_start` index plus Convex's serializable OCC.
 *
 * - Notifications are written atomically inside the mutation that triggers
 *   them, and consumed via reactive `useQuery` subscriptions on the client.
 *   Recipients can be either a manager (e.g. "job completed") or a
 *   technician (e.g. "job assigned"), so the recipient FK is a union.
 */

export const QUOTE_STATUSES = ["unscheduled", "scheduled", "completed"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const JOB_STATUSES = ["scheduled", "completed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const NOTIFICATION_KINDS = [
  "job_assigned",
  "job_updated",
  "job_completed",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const RECIPIENT_KINDS = ["manager", "technician"] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

export default defineSchema({
  managers: defineTable({
    // Canonical Convex identity string (`{issuer}|{subject}`). Per the
    // Convex auth guidelines we look up by this on every authenticated call.
    tokenIdentifier: v.string(),
    // Convenience copy of the Clerk subject ("user_xxx"), useful for logs
    // and for joining against Clerk webhook payloads later.
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_id", ["clerkId"]),

  technicians: defineTable({
    tokenIdentifier: v.string(),
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    // Hex color used to render this tech's events on the schedule grid.
    // Optional; the UI falls back to a deterministic hash of the id.
    color: v.optional(v.string()),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_id", ["clerkId"]),

  quotes: defineTable({
    title: v.string(),
    description: v.string(),
    customerName: v.string(),
    customerAddress: v.optional(v.string()),
    // Default duration in hours (used to pre-fill the assignment dialog).
    estimatedHours: v.number(),
    status: v.union(
      v.literal("unscheduled"),
      v.literal("scheduled"),
      v.literal("completed"),
    ),
    createdByManagerId: v.id("managers"),
  })
    .index("by_status", ["status"])
    .index("by_manager", ["createdByManagerId"]),

  jobs: defineTable({
    quoteId: v.id("quotes"),
    technicianId: v.id("technicians"),
    managerId: v.id("managers"),
    // Both stored as epoch milliseconds. We use a half-open interval
    // [start, end) so adjacent jobs (one ends at 2pm, next starts at 2pm)
    // do NOT count as overlapping.
    start: v.number(),
    end: v.number(),
    status: v.union(v.literal("scheduled"), v.literal("completed")),
    completedAt: v.optional(v.number()),
  })
    // Critical index for the overlap check in `jobs.assign`. Querying with
    // `.eq("technicianId", x).lt("start", proposedEnd)` narrows the OCC
    // read set so concurrent assignments to *different* technicians don't
    // contend with each other. See https://stack.convex.dev/high-throughput-mutations-via-precise-queries
    .index("by_technicianId_and_start", ["technicianId", "start"])
    .index("by_technicianId_and_status", ["technicianId", "status"])
    .index("by_quoteId", ["quoteId"])
    .index("by_managerId", ["managerId"]),

  notifications: defineTable({
    // Recipient. A notification's recipient can be either a manager
    // ("job completed by tech") or a technician ("you have a new job"),
    // so the FK is a typed union and we keep a `recipientKind` literal
    // alongside it for ergonomic filtering on the client.
    recipientKind: v.union(v.literal("manager"), v.literal("technician")),
    recipientId: v.union(v.id("managers"), v.id("technicians")),
    kind: v.union(
      v.literal("job_assigned"),
      v.literal("job_updated"),
      v.literal("job_completed"),
    ),
    jobId: v.id("jobs"),
    message: v.string(),
    // null/undefined => unread. We store an epoch-ms read time when the
    // recipient acknowledges the notification.
    readAt: v.optional(v.number()),
  })
    // Lets us efficiently fetch unread notifications for the current user
    // by querying `.eq("recipientId", me).eq("readAt", undefined)`.
    .index("by_recipientId_and_readAt", ["recipientId", "readAt"])
    .index("by_recipientId", ["recipientId"]),
});
