import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireManager, requireTechnician, getCurrentUser } from "./lib/auth";
import { overlaps } from "./lib/intervals";

/**
 * Jobs are the assignment of a Quote to a Technician for a specific
 * time window [start, end). This module is the heart of the project:
 * `assign` and `reschedule` enforce **backend conflict prevention** so
 * a technician can never end up with two overlapping jobs, even under
 * concurrent assignments by multiple managers.
 *
 * The mechanism is Convex's serializable optimistic concurrency control
 * (OCC). Each mutation is a deterministic transaction; Convex tracks
 * the read set automatically and either commits the writes atomically
 * or aborts and retries the entire function. Because we narrow the
 * overlap query with the `by_technicianId_and_start` index, two assigns
 * to *different* technicians never touch each other's read sets and
 * commit in parallel. Two assigns to the same technician with
 * non-overlapping windows also commit in parallel (different index
 * keys). Two assigns to the same technician with overlapping windows
 * collide — one wins, the loser retries, observes the winner in its
 * read set, and throws a deterministic OVERLAP error. No locks, no
 * SQL exclusion constraints, no application-layer queue.
 *
 * See the "predicate locking" pattern in
 * https://stack.convex.dev/high-throughput-mutations-via-precise-queries
 * for the technique used here.
 */

// -----------------------------------------------------------------------
// Constants and validators
// -----------------------------------------------------------------------

/** Hard ceiling on a single job's duration. Beyond a working day a
 * window almost certainly indicates a misclick or off-by-1000-units
 * error in the client-side date math. The validator catches it. */
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MIN_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/** Grace window for "start in the past" rejection. Any value within
 * five minutes of `Date.now()` on the server is allowed, to absorb
 * client-server clock skew and the brief delay between the form
 * submission and the mutation actually executing. */
const PAST_START_GRACE_MS = 5 * 60 * 1000;

const jobValidator = v.object({
  _id: v.id("jobs"),
  _creationTime: v.number(),
  quoteId: v.id("quotes"),
  technicianId: v.id("technicians"),
  managerId: v.id("managers"),
  start: v.number(),
  end: v.number(),
  status: v.union(v.literal("scheduled"), v.literal("completed")),
  completedAt: v.optional(v.number()),
});

// -----------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------

/**
 * Validates an [start, end) window against the project's invariants.
 *
 * - end > start
 * - duration in [30 min, 24 h]
 * - start not too far in the past (clock skew grace)
 *
 * Returns nothing on success, throws ConvexError on failure. Errors
 * are typed via a `code` field so the client can pattern-match them.
 */
function validateWindow(start: number, end: number, options: {
  // When rescheduling we sometimes legitimately move a job into the
  // past (e.g. recording work that already happened). We still want
  // most callers to enforce the "no past start" rule.
  allowPast?: boolean;
} = {}) {
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

/**
 * Looks for an existing scheduled job on `technicianId` that overlaps
 * `[newStart, newEnd)`. Returns the conflicting job if there is one.
 *
 * Implementation note — narrowing the read set:
 *   `q.eq("technicianId", x).lt("start", newEnd)` reads only this
 *   technician's jobs that *start before our proposed window ends*.
 *   That set is a strict superset of all possible overlappers (a job
 *   starting at or after `newEnd` cannot overlap), and it is the
 *   smallest set we can express purely through the index — we still
 *   have to filter by `end > newStart` in JS because indexes can't
 *   express that condition with a fixed `start` upper bound. The set
 *   is small in practice and the OCC read set is bounded to it.
 *
 * The optional `excludeJobId` is for `reschedule` so a job doesn't
 * conflict with its own pre-update self.
 */
async function findOverlappingJob(
  ctx: MutationCtx,
  technicianId: Id<"technicians">,
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
    // Completed jobs are historical record; they don't block new
    // bookings. The schema only has scheduled/completed, so this
    // check is the right "is this slot held?" predicate.
    if (job.status !== "scheduled") continue;
    if (overlaps(job.start, job.end, newStart, newEnd)) {
      return job;
    }
  }
  return null;
}

// -----------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------

/**
 * Assigns an unscheduled quote to a technician for a specific window.
 *
 * Atomic: either all four writes succeed together, or none do.
 *  1. insert the new `jobs` row
 *  2. patch the quote to `status: "scheduled"`
 *  3. insert a `notifications` row for the technician
 *
 * Errors a manager UI should pattern-match on the `code` field of the
 * thrown ConvexError:
 *  - "OVERLAP"        -> another job is in this slot. Render the
 *                        conflicting window so the user knows what to
 *                        change. Payload: { conflictId, conflictStart,
 *                        conflictEnd }.
 *  - "QUOTE_UNAVAILABLE" -> the quote was already scheduled or
 *                           completed (race with another manager).
 *  - "INVALID_WINDOW" -> bad input (end<=start, > 24h, in the past, …)
 *  - "FORBIDDEN"      -> caller is not a manager.
 */
export const assign = mutation({
  args: {
    quoteId: v.id("quotes"),
    technicianId: v.id("technicians"),
    start: v.number(),
    end: v.number(),
  },
  returns: v.id("jobs"),
  handler: async (ctx, { quoteId, technicianId, start, end }): Promise<Id<"jobs">> => {
    const manager = await requireManager(ctx);
    validateWindow(start, end);

    const quote = await ctx.db.get(quoteId);
    if (!quote) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Quote not found.",
      });
    }
    if (quote.status !== "unscheduled") {
      throw new ConvexError({
        code: "QUOTE_UNAVAILABLE",
        message:
          "This quote has already been scheduled. Refresh and try again.",
      });
    }

    const technician = await ctx.db.get(technicianId);
    if (!technician) {
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
        // The client uses these to render an informative toast like
        // "Conflict at 2:00pm – 4:00pm" without an extra round-trip.
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
      recipientKind: "technician",
      recipientId: technicianId,
      kind: "job_assigned",
      jobId,
      message: `New job: ${quote.title}`,
    });

    return jobId;
  },
});

/**
 * Moves an existing scheduled job to a new window. Same overlap guard
 * as `assign`, but excludes the job being moved from the search so it
 * doesn't conflict with its own pre-update times.
 *
 * Refuses to reschedule a completed job — those are immutable record.
 */
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
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Job not found.",
      });
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
      recipientKind: "technician",
      recipientId: job.technicianId,
      kind: "job_updated",
      jobId,
      message: `Updated job: ${quote?.title ?? "Job"}`,
    });
    return null;
  },
});

/**
 * Marks a job complete. Only the assigned technician (or — debatable —
 * the manager who created it) is allowed to do this. We keep it strict:
 * technicians complete their own jobs, full stop. A future "manager
 * cancels job" flow will be a separate mutation with different
 * semantics (notification of cancellation, possibly quote -> unscheduled).
 *
 * Atomic:
 *  - patch the job to completed (+ completedAt)
 *  - patch the quote to completed
 *  - notify the manager who scheduled it
 */
export const complete = mutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const technician = await requireTechnician(ctx);

    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Job not found.",
      });
    }
    if (job.technicianId !== technician._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only complete jobs assigned to you.",
      });
    }
    if (job.status === "completed") {
      // Idempotent — a double-tap on "Mark complete" shouldn't error.
      return null;
    }

    const completedAt = Date.now();
    await ctx.db.patch(jobId, { status: "completed", completedAt });
    await ctx.db.patch(job.quoteId, { status: "completed" });

    const quote = await ctx.db.get(job.quoteId);
    await ctx.db.insert("notifications", {
      recipientKind: "manager",
      recipientId: job.managerId,
      kind: "job_completed",
      jobId,
      message: `${technician.name} completed: ${quote?.title ?? "Job"}`,
    });
    return null;
  },
});

// -----------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------

/**
 * Lists jobs for one technician within an optional time window.
 *
 * Auth model:
 *  - A technician can list their *own* jobs. `technicianId` is ignored
 *    — we always use the caller's id.
 *  - A manager can list any technician's jobs by passing `technicianId`.
 *
 * The `range` is half-open [start, end), matching the job intervals.
 * Without it, we return all the technician's jobs (capped at 200) so a
 * naive caller doesn't hit pagination. The calendar page in Step 8
 * passes a precise week range.
 */
export const listForTechnician = query({
  args: {
    technicianId: v.optional(v.id("technicians")),
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

    let targetId: Id<"technicians">;
    if (me.kind === "technician") {
      // Technicians can only see their own schedule, even if they
      // happen to know another tech's id.
      targetId = me.doc._id;
    } else {
      if (!technicianId) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Manager calls must specify a technicianId.",
        });
      }
      targetId = technicianId;
    }

    // Use the index for an efficient by-tech-by-start scan. The
    // `lt("start", rangeEnd)` predicate narrows the read set further
    // when a range is supplied.
    const results = await ctx.db
      .query("jobs")
      .withIndex("by_technicianId_and_start", (q) => {
        const base = q.eq("technicianId", targetId);
        return rangeEnd !== undefined ? base.lt("start", rangeEnd) : base;
      })
      .order("asc")
      .take(200);

    if (rangeStart !== undefined) {
      // Filter the lower bound in JS — same reasoning as in
      // findOverlappingJob: the index can express one bound on a
      // single field at a time.
      return results.filter((job) => job.end > rangeStart);
    }
    return results;
  },
});

/**
 * Lists every job in a date range across all technicians. Manager-only
 * — this drives the cross-tech calendar view (Step 8). For now it's
 * implemented with `_creationTime` desc + an in-memory range filter,
 * which is fine for the demo's volume. Add a `by_start` index later
 * if needed.
 */
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

/**
 * Fetches a single job. Authorization: any signed-in user, but only
 * the assigned technician or any manager can see it. (Privacy: another
 * technician shouldn't see Bob's jobs by guessing an id.)
 */
export const getById = query({
  args: { id: v.id("jobs") },
  returns: v.union(jobValidator, v.null()),
  handler: async (ctx, { id }) => {
    const me = await getCurrentUser(ctx);
    if (!me) return null;
    const job = await ctx.db.get(id);
    if (!job) return null;
    if (me.kind === "technician" && job.technicianId !== me.doc._id) {
      return null;
    }
    return job;
  },
});
