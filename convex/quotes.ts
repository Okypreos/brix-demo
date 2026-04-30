import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireManager, requireCurrentUser } from "./lib/auth";

/**
 * Quotes are managed exclusively by managers. Technicians don't see them
 * directly — they see the Jobs that get created from a Quote when a
 * manager assigns it (Step 6).
 *
 * All public queries here are gated to managers. If a technician later
 * needs to read a quote (e.g. to display job details on their schedule),
 * a separate `getForJob` query will authorize via job ownership rather
 * than relaxing this gate.
 */

// -----------------------------------------------------------------------
// Validators
// -----------------------------------------------------------------------

/**
 * Status filter accepted by `list`. We define it once so client TS picks
 * up the union via `infer` rather than forcing both sides to repeat the
 * literals. Optional: undefined means "all statuses".
 */
const statusValidator = v.union(
  v.literal("unscheduled"),
  v.literal("scheduled"),
  v.literal("completed"),
);

/**
 * Shape of a quote row as returned to the client. Mirrors the schema +
 * the auto-generated `_id` and `_creationTime` system fields.
 */
const quoteValidator = v.object({
  _id: v.id("quotes"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.string(),
  customerName: v.string(),
  customerAddress: v.optional(v.string()),
  estimatedHours: v.number(),
  status: statusValidator,
  createdByManagerId: v.id("managers"),
});

// -----------------------------------------------------------------------
// Server-side argument validation
//
// We mirror the client-side zod constraints here so a malicious client
// that bypasses the form can't poison our DB. These bounds match
// `lib/validators/quote.ts` (kept in sync manually — there's a TODO to
// share them via a `convex/lib/quote-rules.ts` file once we add edits).
// -----------------------------------------------------------------------

function validateTitle(title: string) {
  const t = title.trim();
  if (t.length < 1 || t.length > 120) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "title",
      message: "Title must be between 1 and 120 characters.",
    });
  }
  return t;
}

function validateDescription(description: string) {
  if (description.length > 2000) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "description",
      message: "Description must be 2000 characters or fewer.",
    });
  }
  return description;
}

function validateCustomerName(name: string) {
  const n = name.trim();
  if (n.length < 1 || n.length > 120) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "customerName",
      message: "Customer name must be between 1 and 120 characters.",
    });
  }
  return n;
}

function validateCustomerAddress(address: string | undefined) {
  if (address === undefined) return undefined;
  const a = address.trim();
  if (a.length === 0) return undefined;
  if (a.length > 200) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "customerAddress",
      message: "Address must be 200 characters or fewer.",
    });
  }
  return a;
}

function validateEstimatedHours(hours: number) {
  // Half-hour granularity, between 30 minutes and a 24-hour day.
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 24) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "estimatedHours",
      message: "Estimated hours must be between 0.5 and 24.",
    });
  }
  // Snap to 0.5 increments. Multiplying by 2 dodges floating-point
  // drift that `% 0.5 !== 0` would suffer from.
  if ((hours * 2) % 1 !== 0) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "estimatedHours",
      message: "Estimated hours must be in increments of 0.5.",
    });
  }
  return hours;
}

// -----------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------

/**
 * Creates a new quote. The caller must be a manager; the quote is
 * stamped with their `_id` so we can show "created by" later if needed.
 *
 * New quotes always start as `unscheduled`. Scheduling happens later by
 * creating a Job from the quote (`jobs.assign`), which atomically flips
 * the quote's status to `scheduled` in the same mutation.
 */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    customerName: v.string(),
    customerAddress: v.optional(v.string()),
    estimatedHours: v.number(),
  },
  returns: v.id("quotes"),
  handler: async (ctx, args): Promise<Id<"quotes">> => {
    const manager = await requireManager(ctx);

    const title = validateTitle(args.title);
    const description = validateDescription(args.description);
    const customerName = validateCustomerName(args.customerName);
    const customerAddress = validateCustomerAddress(args.customerAddress);
    const estimatedHours = validateEstimatedHours(args.estimatedHours);

    return await ctx.db.insert("quotes", {
      title,
      description,
      customerName,
      customerAddress,
      estimatedHours,
      status: "unscheduled",
      createdByManagerId: manager._id,
    });
  },
});

/**
 * Updates a quote's editable fields. Refuses to touch a quote whose
 * Job has already been completed — those are immutable for audit. A
 * `scheduled` quote can still be edited because rescheduling/details
 * are common before the work happens.
 *
 * The fields are all optional so the client can do partial updates;
 * undefined means "don't change this field".
 */
export const update = mutation({
  args: {
    id: v.id("quotes"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerAddress: v.optional(v.string()),
    estimatedHours: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireManager(ctx);

    const quote = await ctx.db.get(args.id);
    if (!quote) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Quote not found.",
      });
    }
    if (quote.status === "completed") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Completed quotes cannot be edited.",
      });
    }

    const patch: Partial<Doc<"quotes">> = {};
    if (args.title !== undefined) patch.title = validateTitle(args.title);
    if (args.description !== undefined)
      patch.description = validateDescription(args.description);
    if (args.customerName !== undefined)
      patch.customerName = validateCustomerName(args.customerName);
    if (args.customerAddress !== undefined)
      patch.customerAddress = validateCustomerAddress(args.customerAddress);
    if (args.estimatedHours !== undefined)
      patch.estimatedHours = validateEstimatedHours(args.estimatedHours);

    await ctx.db.patch(args.id, patch);
    return null;
  },
});

/**
 * Permanently deletes an unscheduled quote.
 *
 * Refuses to delete a quote that already has a Job (i.e. status is
 * `scheduled` or `completed`) — that would orphan the technician's
 * calendar event and break audit history. The UI should hide the
 * delete action for those quotes anyway, but this is the security
 * boundary if a client bypasses the UI.
 *
 * Returns the deleted quote's title so the toast can confirm exactly
 * what was removed.
 */
export const remove = mutation({
  args: { id: v.id("quotes") },
  returns: v.object({ title: v.string() }),
  handler: async (ctx, { id }) => {
    await requireManager(ctx);

    const quote = await ctx.db.get(id);
    if (!quote) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Quote not found.",
      });
    }
    if (quote.status !== "unscheduled") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message:
          "Only unscheduled quotes can be deleted. Cancel the job first if you need to remove a scheduled or completed quote.",
      });
    }

    await ctx.db.delete(id);
    return { title: quote.title };
  },
});

// -----------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------

/**
 * Lists quotes, optionally filtered by status. Returns at most 100 rows
 * ordered by `_creationTime` descending (newest first).
 *
 * For the take-home demo this fits the use case (5-10 quotes). When
 * volume grows, swap this for a paginated variant using
 * `paginationOptsValidator` + `usePaginatedQuery` on the client. The
 * card grid UI's `<QuotesGrid>` is structured to accept either shape.
 */
export const list = query({
  args: {
    status: v.optional(statusValidator),
  },
  returns: v.array(quoteValidator),
  handler: async (ctx, { status }) => {
    await requireManager(ctx);

    if (status !== undefined) {
      // Use the `by_status` index so filtered reads stay cheap and
      // avoid touching unrelated rows. Default order on an indexed
      // query is ascending by the indexed field; we want newest first
      // so we reverse with `.order("desc")` which the docs guarantee
      // also sorts by `_creationTime` within equal index values.
      return await ctx.db
        .query("quotes")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(100);
    }

    return await ctx.db.query("quotes").order("desc").take(100);
  },
});

/**
 * Convenience query: just the unscheduled quotes. Used by the
 * assignment flow (Step 6) where we only ever care about quotes that
 * are eligible to be turned into jobs.
 */
export const listUnscheduled = query({
  args: {},
  returns: v.array(quoteValidator),
  handler: async (ctx) => {
    await requireManager(ctx);
    return await ctx.db
      .query("quotes")
      .withIndex("by_status", (q) => q.eq("status", "unscheduled"))
      .order("desc")
      .take(100);
  },
});

/**
 * Fetches a single quote by id. Returns null if not found so the UI
 * can render a 404 rather than throwing.
 *
 * Authorization note: gated to managers for now. When technicians need
 * to read the quote tied to one of their jobs, we'll add a separate
 * `getForJob` query that authorizes via job ownership.
 */
export const get = query({
  args: { id: v.id("quotes") },
  returns: v.union(quoteValidator, v.null()),
  handler: async (ctx, { id }) => {
    await requireManager(ctx);
    return (await ctx.db.get(id)) ?? null;
  },
});

/**
 * Aggregate counts per status, used by the manager dashboard KPIs and
 * the tabs on the quotes page (so we can show e.g. "Unscheduled (3)").
 *
 * Implementation: three small indexed queries instead of one big scan.
 * Each `.collect()` is bounded by the size of its status group, which
 * the schema's `by_status` index keeps efficient.
 */
export const counts = query({
  args: {},
  returns: v.object({
    unscheduled: v.number(),
    scheduled: v.number(),
    completed: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    // Allow any authenticated user to read counts — both manager
    // dashboards (rich KPI panel) and a future technician home page
    // ("you have N jobs today") might want similar shapes. We still
    // require auth though, because raw counts can leak business size.
    await requireCurrentUser(ctx);

    const [unscheduled, scheduled, completed] = await Promise.all([
      ctx.db
        .query("quotes")
        .withIndex("by_status", (q) => q.eq("status", "unscheduled"))
        .collect(),
      ctx.db
        .query("quotes")
        .withIndex("by_status", (q) => q.eq("status", "scheduled"))
        .collect(),
      ctx.db
        .query("quotes")
        .withIndex("by_status", (q) => q.eq("status", "completed"))
        .collect(),
    ]);

    return {
      unscheduled: unscheduled.length,
      scheduled: scheduled.length,
      completed: completed.length,
      total: unscheduled.length + scheduled.length + completed.length,
    };
  },
});
