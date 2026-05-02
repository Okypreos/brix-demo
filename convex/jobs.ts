import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireManager, requireTechnician, getCurrentUser } from "./lib/auth";
import { overlaps } from "./lib/intervals";

// Jobs assign a Quote to a Technician for a window [start, end).
// `assign` and `reschedule` enforce no-overlap on the same technician
// using Convex's serializable OCC: concurrent overlapping writes
// collide, the loser retries, sees the winner, throws OVERLAP.
// The `by_technicianId_and_start` index narrows the read set so
// assigns to different technicians don't contend.

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MIN_DURATION_MS = 30 * 60 * 1000;
// Grace for clock skew + the gap between submit and execute.
const PAST_START_GRACE_MS = 5 * 60 * 1000;

const jobValidator = v.object({
  _id: v.id("jobs"),
  _creationTime: v.number(),
  quoteId: v.id("quotes"),
  technicianId: v.id("users"),
  managerId: v.id("users"),
  start: v.number(),
  end: v.number(),
  status: v.union(v.literal("scheduled"), v.literal("completed")),
  completedAt: v.optional(v.number()),
});

// Validates [start, end). Throws ConvexError with a `code` so the
// client can pattern-match.
function validateWindow(
  start: number,
  end: number,
  options: { allowPast?: boolean } = {},
) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new ConvexError({
      code: "INVALID_WINDOW",
      message: "Job start and end must be valid timestamps.",
    });
  }
  if (end <= start) {
    throw new ConvexError({
      code: "INVALID_WINDOW",
      message: "Job end must be after job start.",
    });
  }
  const duration = end - start;
  if (duration < MIN_DURATION_MS) {
    throw new ConvexError({
      code: "INVALID_WINDOW",
      message: "Job must be at least 30 minutes long.",
    });
  }
  if (duration > MAX_DURATION_MS) {
    throw new ConvexError({
      code: "INVALID_WINDOW",
      message: "Job cannot be longer than 24 hours.",
    });
  }
  if (!options.allowPast && start < Date.now() - PAST_START_GRACE_MS) {
    throw new ConvexError({
      code: "INVALID_WINDOW",
      message: "Job start cannot be in the past.",
    });
  }
}

// Returns a scheduled job on `technicianId` overlapping [newStart, newEnd),
// or null. `excludeJobId` lets reschedule skip the moving job.
//
// The `lt("start", newEnd)` predicate is the tightest the index can
// express; we filter the lower bound in JS.
async function findOverlappingJob(
  ctx: MutationCtx,
  technicianId: Id<"users">,
  newStart: number,
  newEnd: number,
  excludeJobId?: Id<"jobs">,
): Promise<Doc<"jobs"> | null> {
  const candidates = await ctx.db
    .query("jobs")
    .withIndex("by_technicianId_and_start", (q) =>
      q.eq("technicianId", technicianId).lt("start", newEnd),
    )
    .collect();

  for (const job of candidates) {
    if (job._id === excludeJobId) continue;
    // Completed jobs are history; they don't block new bookings.
    if (job.status !== "scheduled") continue;
    if (overlaps(job.start, job.end, newStart, newEnd)) {
      return job;
    }
  }
  return null;
}

// Assigns an unscheduled quote to a technician. Atomic: insert job,
// patch quote to scheduled, write notification.
//
// Errors clients should pattern-match on:
//   OVERLAP            — slot taken; payload has conflictId/Start/End.
//   QUOTE_UNAVAILABLE  — already scheduled by another manager.
//   INVALID_WINDOW     — bad input.
//   FORBIDDEN          — caller is not a manager.
export const assign = mutation({
  args: {
    quoteId: v.id("quotes"),
    technicianId: v.id("users"),
    start: v.number(),
    end: v.number(),
  },
  returns: v.id("jobs"),
  handler: async (ctx, { quoteId, technicianId, start, end }): Promise<Id<"jobs">> => {
    const manager = await requireManager(ctx);
    validateWindow(start, end);

    const quote = await ctx.db.get(quoteId);
    if (!quote) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Quote not found." });
    }
    if (quote.status !== "unscheduled") {
      throw new ConvexError({
        code: "QUOTE_UNAVAILABLE",
        message:
          "This quote has already been scheduled. Refresh and try again.",
      });
    }

    // Single users table => any Id<"users"> could be a manager. Reject
    // anything that isn't actually a technician.
    const technician = await ctx.db.get(technicianId);
    if (!technician || technician.role !== "technician") {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Technician not found.",
      });
    }

    const conflict = await findOverlappingJob(ctx, technicianId, start, end);
    if (conflict) {
      throw new ConvexError({
        code: "OVERLAP",
        message: `${technician.name} already has a job during that time.`,
        conflictId: conflict._id,
        conflictStart: conflict.start,
        conflictEnd: conflict.end,
      });
    }

    const jobId = await ctx.db.insert("jobs", {
      quoteId,
      technicianId,
      managerId: manager._id,
      start,
      end,
      status: "scheduled",
    });

    await ctx.db.patch(quoteId, { status: "scheduled" });

    await ctx.db.insert("notifications", {
      recipientId: technicianId,
      kind: "job_assigned",
      jobId,
      message: `New job: ${quote.title}`,
    });

    return jobId;
  },
});

// Moves a scheduled job. Same overlap guard as `assign`, excluding the
// job being moved. Completed jobs are immutable record.
export const reschedule = mutation({
  args: {
    jobId: v.id("jobs"),
    start: v.number(),
    end: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { jobId, start, end }) => {
    await requireManager(ctx);
    validateWindow(start, end);

    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Job not found." });
    }
    if (job.status === "completed") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Completed jobs cannot be rescheduled.",
      });
    }

    const conflict = await findOverlappingJob(
      ctx,
      job.technicianId,
      start,
      end,
      jobId,
    );
    if (conflict) {
      const technician = await ctx.db.get(job.technicianId);
      throw new ConvexError({
        code: "OVERLAP",
        message: `${technician?.name ?? "Technician"} already has a job during that time.`,
        conflictId: conflict._id,
        conflictStart: conflict.start,
        conflictEnd: conflict.end,
      });
    }

    await ctx.db.patch(jobId, { start, end });

    const quote = await ctx.db.get(job.quoteId);
    await ctx.db.insert("notifications", {
      recipientId: job.technicianId,
      kind: "job_updated",
      jobId,
      message: `Updated job: ${quote?.title ?? "Job"}`,
    });
    return null;
  },
});

// Marks a job complete. Only the assigned technician can do this.
// Patches job + quote to completed and notifies the manager.
// Idempotent on already-completed jobs.
export const complete = mutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const technician = await requireTechnician(ctx);

    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Job not found." });
    }
    if (job.technicianId !== technician._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only complete jobs assigned to you.",
      });
    }
    if (job.status === "completed") return null;

    const completedAt = Date.now();
    await ctx.db.patch(jobId, { status: "completed", completedAt });
    await ctx.db.patch(job.quoteId, { status: "completed" });

    const quote = await ctx.db.get(job.quoteId);
    await ctx.db.insert("notifications", {
      recipientId: job.managerId,
      kind: "job_completed",
      jobId,
      message: `${technician.name} completed: ${quote?.title ?? "Job"}`,
    });
    return null;
  },
});

// Lists jobs for one technician within an optional time window.
// Technicians always see their own; managers can pass `technicianId`.
// Returns at most 200 rows.
export const listForTechnician = query({
  args: {
    technicianId: v.optional(v.id("users")),
    rangeStart: v.optional(v.number()),
    rangeEnd: v.optional(v.number()),
  },
  returns: v.array(jobValidator),
  handler: async (ctx, { technicianId, rangeStart, rangeEnd }) => {
    const me = await getCurrentUser(ctx);
    if (!me) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Sign in to view jobs.",
      });
    }

    let targetId: Id<"users">;
    if (me.role === "technician") {
      targetId = me._id;
    } else {
      if (!technicianId) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Manager calls must specify a technicianId.",
        });
      }
      targetId = technicianId;
    }

    const results = await ctx.db
      .query("jobs")
      .withIndex("by_technicianId_and_start", (q) => {
        const base = q.eq("technicianId", targetId);
        return rangeEnd !== undefined ? base.lt("start", rangeEnd) : base;
      })
      .order("asc")
      .take(200);

    if (rangeStart !== undefined) {
      // Lower bound has to be filtered in JS (index can only express
      // one bound at a time).
      return results.filter((job) => job.end > rangeStart);
    }
    return results;
  },
});

// Same as `listForTechnician` but joins each job with its quote so the
// calendar can render titles without a second round-trip. Including
// quotes in the read set means a quote rename instantly updates open
// calendar events too.
const jobWithQuoteValidator = v.object({
  _id: v.id("jobs"),
  _creationTime: v.number(),
  quoteId: v.id("quotes"),
  technicianId: v.id("users"),
  managerId: v.id("users"),
  start: v.number(),
  end: v.number(),
  status: v.union(v.literal("scheduled"), v.literal("completed")),
  completedAt: v.optional(v.number()),
  quote: v.object({
    title: v.string(),
    description: v.string(),
    customerName: v.string(),
    customerAddress: v.optional(v.string()),
  }),
});

export const listWithQuotes = query({
  args: {
    technicianId: v.optional(v.id("users")),
    rangeStart: v.optional(v.number()),
    rangeEnd: v.optional(v.number()),
  },
  returns: v.array(jobWithQuoteValidator),
  handler: async (ctx, { technicianId, rangeStart, rangeEnd }) => {
    const me = await getCurrentUser(ctx);
    if (!me) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Sign in to view jobs.",
      });
    }

    let targetId: Id<"users">;
    if (me.role === "technician") {
      targetId = me._id;
    } else {
      if (!technicianId) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Manager calls must specify a technicianId.",
        });
      }
      targetId = technicianId;
    }

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_technicianId_and_start", (q) => {
        const base = q.eq("technicianId", targetId);
        return rangeEnd !== undefined ? base.lt("start", rangeEnd) : base;
      })
      .order("asc")
      .take(200);

    const filtered =
      rangeStart !== undefined
        ? jobs.filter((j) => j.end > rangeStart)
        : jobs;

    const out = [];
    for (const job of filtered) {
      const quote = await ctx.db.get(job.quoteId);
      // A job without its quote means data corruption. Skip rather
      // than throw so one bad row doesn't blank the whole calendar.
      if (!quote) continue;
      out.push({
        ...job,
        quote: {
          title: quote.title,
          description: quote.description,
          customerName: quote.customerName,
          customerAddress: quote.customerAddress,
        },
      });
    }
    return out;
  },
});

// All jobs in a date range across every technician. Manager-only.
// Capped at 500 with an in-memory range filter; fine for demo volume.
export const listForManager = query({
  args: {
    rangeStart: v.optional(v.number()),
    rangeEnd: v.optional(v.number()),
  },
  returns: v.array(jobValidator),
  handler: async (ctx, { rangeStart, rangeEnd }) => {
    await requireManager(ctx);
    const all = await ctx.db.query("jobs").order("desc").take(500);
    return all.filter((job) => {
      if (rangeStart !== undefined && job.end <= rangeStart) return false;
      if (rangeEnd !== undefined && job.start >= rangeEnd) return false;
      return true;
    });
  },
});

// Single job by id. Technicians can only see their own; managers see all.
export const getById = query({
  args: { id: v.id("jobs") },
  returns: v.union(jobValidator, v.null()),
  handler: async (ctx, { id }) => {
    const me = await getCurrentUser(ctx);
    if (!me) return null;
    const job = await ctx.db.get(id);
    if (!job) return null;
    if (me.role === "technician" && job.technicianId !== me._id) {
      return null;
    }
    return job;
  },
});
