import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// Demo data seeders. Internal mutations called from `seedAction.ts`,
// never from the browser.
//
// Idempotent — safe to re-run. Quotes are deduped by (manager, title);
// jobs are deduped by quoteId (one job per demo quote).
//
// We skip the OCC overlap check here since seed offsets are spaced apart
// by construction. Notifications are also skipped — reviewers don't need
// a backlog from the seed.

const quoteInputValidator = v.object({
  title: v.string(),
  description: v.string(),
  customerName: v.string(),
  customerAddress: v.optional(v.string()),
  estimatedHours: v.number(),
});

// Inserts quotes attributed to the given manager. Existing quotes
// (matched by title scoped to that manager) are left untouched.
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
    const manager: Doc<"users"> | null = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", managerClerkId))
      .unique();
    if (!manager || manager.role !== "manager") {
      throw new ConvexError(
        `seedDemoQuotes: no manager with clerkId=${managerClerkId}. ` +
          `Run promoteToManager first.`,
      );
    }

    // One read of all this manager's quotes is cheaper than per-quote.
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

const jobInputValidator = v.object({
  quoteTitle: v.string(),
  technicianClerkId: v.string(),
  // Window start as ms offset from `now` (negatives = past).
  startOffsetMs: v.number(),
  durationMs: v.number(),
  // If true, mark both job and quote as completed.
  complete: v.optional(v.boolean()),
});

// Assigns previously-seeded quotes to technicians. Backdates some
// (via negative offsets) so the dashboard shows a realistic mix of
// unscheduled, scheduled, and completed work.
//
// Idempotent on quoteId. We don't update status on re-runs — that
// would clobber state the demo user produced via the UI.
export const seedDemoJobs = internalMutation({
  args: {
    managerClerkId: v.string(),
    // Captured by the caller and passed in so retries within a single
    // seed run produce the same offsets.
    now: v.number(),
    jobs: v.array(jobInputValidator),
  },
  returns: v.object({ created: v.number(), skipped: v.number() }),
  handler: async (ctx, { managerClerkId, now, jobs }) => {
    const manager: Doc<"users"> | null = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", managerClerkId))
      .unique();
    if (!manager || manager.role !== "manager") {
      throw new ConvexError(
        `seedDemoJobs: no manager with clerkId=${managerClerkId}.`,
      );
    }

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

      const tech: Doc<"users"> | null = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) =>
          q.eq("clerkId", input.technicianClerkId),
        )
        .unique();
      if (!tech || tech.role !== "technician") {
        throw new ConvexError(
          `seedDemoJobs: no technician with clerkId=${input.technicianClerkId}.`,
        );
      }

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
