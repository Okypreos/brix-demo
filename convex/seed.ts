import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Demo data seeders.
 *
 * These are `internalMutation`s — invoked exclusively from the local
 * `scripts/seed.ts` orchestrator (which authenticates with the Convex
 * deploy key), never from the browser. They exist purely so the live
 * Vercel demo isn't a blank screen on first load.
 *
 * Design choices:
 *
 * 1. Idempotent. The script may run more than once (against the same
 *    Convex deployment) without producing duplicates. We dedupe quotes
 *    by `(managerId, title)` and jobs by `(quoteId)` since each demo
 *    quote is assigned to at most one job.
 *
 * 2. Skip the OCC overlap check. The production `jobs.assign` path
 *    deliberately rejects overlapping windows; the seed picks
 *    non-overlapping windows by construction (offsets are spaced
 *    apart per technician), so running the same overlap check here
 *    would be redundant. If a maintainer adds an offset that does
 *    overlap they'll see a clear `OVERLAP` error from `assign`
 *    instead — but here we want determinism.
 *
 * 3. No notifications written. Reviewers don't need a notification
 *    backlog from the seed; real assignments via the UI will emit
 *    them.
 */

// -----------------------------------------------------------------------
// Quotes
// -----------------------------------------------------------------------

const quoteInputValidator = v.object({
  title: v.string(),
  description: v.string(),
  customerName: v.string(),
  customerAddress: v.optional(v.string()),
  estimatedHours: v.number(),
});

/**
 * Inserts a batch of quotes attributed to the manager identified by
 * `managerClerkId`. Quotes that already exist (matched by `title`
 * scoped to that manager) are left untouched.
 */
export const seedDemoQuotes = internalMutation({
  args: {
    managerClerkId: v.string(),
    quotes: v.array(quoteInputValidator),
  },
  returns: v.object({
    created: v.number(),
    skipped: v.number(),
    quoteIds: v.array(v.id("quotes")),
  }),
  handler: async (ctx, { managerClerkId, quotes }) => {
    const manager: Doc<"managers"> | null = await ctx.db
      .query("managers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", managerClerkId))
      .unique();
    if (!manager) {
      throw new ConvexError(
        `seedDemoQuotes: no manager with clerkId=${managerClerkId}. ` +
          `Run promoteToManager first.`,
      );
    }

    // Single read of all this manager's quotes is cheaper than one
    // query per input quote, and the dataset is bounded (the seed
    // input is small).
    const existing = await ctx.db
      .query("quotes")
      .withIndex("by_manager", (q) =>
        q.eq("createdByManagerId", manager._id),
      )
      .collect();
    const existingByTitle = new Map(existing.map((q) => [q.title, q]));

    let created = 0;
    let skipped = 0;
    const quoteIds: Id<"quotes">[] = [];

    for (const input of quotes) {
      const dupe = existingByTitle.get(input.title);
      if (dupe) {
        skipped++;
        quoteIds.push(dupe._id);
        continue;
      }
      const id = await ctx.db.insert("quotes", {
        title: input.title,
        description: input.description,
        customerName: input.customerName,
        customerAddress: input.customerAddress,
        estimatedHours: input.estimatedHours,
        status: "unscheduled",
        createdByManagerId: manager._id,
      });
      created++;
      quoteIds.push(id);
    }

    return { created, skipped, quoteIds };
  },
});

// -----------------------------------------------------------------------
// Jobs
// -----------------------------------------------------------------------

const jobInputValidator = v.object({
  /** Title of an already-seeded quote belonging to the manager. */
  quoteTitle: v.string(),
  /** ClerkId of the technician to assign. */
  technicianClerkId: v.string(),
  /** Window start, expressed as ms offset from `now` (negatives = past). */
  startOffsetMs: v.number(),
  /** Duration in ms. Must be > 0. */
  durationMs: v.number(),
  /** If true, mark both the job and its quote as completed. */
  complete: v.optional(v.boolean()),
});

/**
 * Assigns previously-seeded quotes to technicians, optionally backdating
 * some so the demo dashboard shows a realistic mix of unscheduled,
 * scheduled, and completed work.
 *
 * Idempotent on `(quoteId)` — if a job already exists for that quote
 * we skip insertion. We do NOT update its status on re-runs (that
 * would clobber any state the demo user produced via the UI).
 */
export const seedDemoJobs = internalMutation({
  args: {
    managerClerkId: v.string(),
    /** `Date.now()` captured by the script. Passing it in keeps this
     * mutation deterministic across retries within a single seed run. */
    now: v.number(),
    jobs: v.array(jobInputValidator),
  },
  returns: v.object({ created: v.number(), skipped: v.number() }),
  handler: async (ctx, { managerClerkId, now, jobs }) => {
    const manager: Doc<"managers"> | null = await ctx.db
      .query("managers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", managerClerkId))
      .unique();
    if (!manager) {
      throw new ConvexError(
        `seedDemoJobs: no manager with clerkId=${managerClerkId}.`,
      );
    }

    // Index manager's quotes by title for fast lookup.
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_manager", (q) =>
        q.eq("createdByManagerId", manager._id),
      )
      .collect();
    const quotesByTitle = new Map(quotes.map((q) => [q.title, q]));

    let created = 0;
    let skipped = 0;

    for (const input of jobs) {
      const quote = quotesByTitle.get(input.quoteTitle);
      if (!quote) {
        throw new ConvexError(
          `seedDemoJobs: no quote titled "${input.quoteTitle}" for ` +
            `manager ${managerClerkId}. Did seedDemoQuotes run first?`,
        );
      }

      const tech: Doc<"technicians"> | null = await ctx.db
        .query("technicians")
        .withIndex("by_clerk_id", (q) =>
          q.eq("clerkId", input.technicianClerkId),
        )
        .unique();
      if (!tech) {
        throw new ConvexError(
          `seedDemoJobs: no technician with clerkId=${input.technicianClerkId}.`,
        );
      }

      // Already seeded a job for this quote? Skip.
      const existing = await ctx.db
        .query("jobs")
        .withIndex("by_quoteId", (q) => q.eq("quoteId", quote._id))
        .unique();
      if (existing) {
        skipped++;
        continue;
      }

      if (input.durationMs <= 0) {
        throw new ConvexError(
          `seedDemoJobs: durationMs must be positive (got ${input.durationMs}).`,
        );
      }

      const start = now + input.startOffsetMs;
      const end = start + input.durationMs;
      const isComplete = input.complete ?? false;

      const jobId = await ctx.db.insert("jobs", {
        quoteId: quote._id,
        technicianId: tech._id,
        managerId: manager._id,
        start,
        end,
        status: isComplete ? "completed" : "scheduled",
        completedAt: isComplete ? end : undefined,
      });

      await ctx.db.patch(quote._id, {
        status: isComplete ? "completed" : "scheduled",
      });

      created++;
      void jobId;
    }

    return { created, skipped };
  },
});
