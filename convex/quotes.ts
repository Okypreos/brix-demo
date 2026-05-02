import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireManager } from "./lib/auth";

// Quotes are managed by managers. Technicians don't see them directly —
// they see the Jobs created from a Quote when one is assigned.
// All public queries here are manager-gated.

const statusValidator = v.union(
  v.literal("unscheduled"),
  v.literal("scheduled"),
  v.literal("completed"),
);

const quoteValidator = v.object({
  _id: v.id("quotes"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.string(),
  customerName: v.string(),
  customerAddress: v.optional(v.string()),
  estimatedHours: v.number(),
  status: statusValidator,
  createdByManagerId: v.id("users"),
});

// Server-side validation. Mirrors the client zod (lib/validators/quote.ts)
// so a malicious client bypassing the form can't poison the DB.

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
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 24) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "estimatedHours",
      message: "Estimated hours must be between 0.5 and 24.",
    });
  }
  // Snap to 0.5 increments. Multiplying by 2 dodges floating-point drift.
  if ((hours * 2) % 1 !== 0) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "estimatedHours",
      message: "Estimated hours must be in increments of 0.5.",
    });
  }
  return hours;
}

// Creates a quote in `unscheduled`. Stamped with the calling manager's id.
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

    return await ctx.db.insert("quotes", {
      title: validateTitle(args.title),
      description: validateDescription(args.description),
      customerName: validateCustomerName(args.customerName),
      customerAddress: validateCustomerAddress(args.customerAddress),
      estimatedHours: validateEstimatedHours(args.estimatedHours),
      status: "unscheduled",
      createdByManagerId: manager._id,
    });
  },
});

// Partial update. Refuses completed quotes (immutable for audit).
// Scheduled quotes are still editable since rescheduling/details are
// common before the work happens.
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
      throw new ConvexError({ code: "NOT_FOUND", message: "Quote not found." });
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

// Deletes an unscheduled quote. Refuses anything with a Job — that
// would orphan the technician's calendar event. Cancel the job first.
export const remove = mutation({
  args: { id: v.id("quotes") },
  returns: v.object({ title: v.string() }),
  handler: async (ctx, { id }) => {
    await requireManager(ctx);

    const quote = await ctx.db.get(id);
    if (!quote) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Quote not found." });
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

// Lists quotes, optionally filtered by status. Newest first, capped at 100.
// Swap for a paginated variant if volume grows.
export const list = query({
  args: { status: v.optional(statusValidator) },
  returns: v.array(quoteValidator),
  handler: async (ctx, { status }) => {
    await requireManager(ctx);

    if (status !== undefined) {
      return await ctx.db
        .query("quotes")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(100);
    }

    return await ctx.db.query("quotes").order("desc").take(100);
  },
});

// Just the unscheduled quotes — used by the assignment dialog.
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

// Single quote by id. Returns null on miss so the UI can render a 404.
// Manager-only for now; if technicians need quote details we'll add a
// separate `getForJob` that authorizes via job ownership.
export const get = query({
  args: { id: v.id("quotes") },
  returns: v.union(quoteValidator, v.null()),
  handler: async (ctx, { id }) => {
    await requireManager(ctx);
    return (await ctx.db.get(id)) ?? null;
  },
});

// Counts per status. Drives the dashboard KPIs and quotes-page tabs.
// Three indexed queries instead of a full table scan.
export const counts = query({
  args: {},
  returns: v.object({
    unscheduled: v.number(),
    scheduled: v.number(),
    completed: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    await requireManager(ctx);

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
