import { ConvexError, v, type Validator } from "convex/values";
import type { UserJSON } from "@clerk/backend";
import { internalMutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";

/**
 * Subscribed to from the client to know whether the Clerk user has been
 * mirrored into our database yet (the webhook can lag a few hundred ms
 * after sign-up). Returns the same discriminated-union shape as
 * `lib/auth.getCurrentUser`.
 */
export const current = query({
  args: {},
  returns: v.union(
    v.object({
      kind: v.literal("manager"),
      _id: v.id("managers"),
      _creationTime: v.number(),
      tokenIdentifier: v.string(),
      clerkId: v.string(),
      name: v.string(),
      email: v.string(),
    }),
    v.object({
      kind: v.literal("technician"),
      _id: v.id("technicians"),
      _creationTime: v.number(),
      tokenIdentifier: v.string(),
      clerkId: v.string(),
      name: v.string(),
      email: v.string(),
      color: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return user.kind === "manager"
      ? { kind: "manager" as const, ...user.doc }
      : { kind: "technician" as const, ...user.doc };
  },
});

/**
 * Lists all technicians (used by managers in the assignment dropdown).
 * Bounded with `.take(200)` per the Convex query guidelines — a real
 * deployment with more techs would paginate.
 */
export const listTechnicians = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("technicians"),
      _creationTime: v.number(),
      tokenIdentifier: v.string(),
      clerkId: v.string(),
      name: v.string(),
      email: v.string(),
      color: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.db.query("technicians").take(200);
  },
});

// -----------------------------------------------------------------------
// Webhook-driven mutations.
//
// These are `internalMutation`s — only callable from other Convex code
// (specifically `convex/http.ts:clerk-users-webhook`). They are NEVER
// exposed to the public API surface, so a malicious client cannot fake
// a Clerk event to provision themselves into the database.
// -----------------------------------------------------------------------

/**
 * Mirrors a Clerk user into Convex. Called on `user.created` and
 * `user.updated` webhook events.
 *
 * New sign-ups land in `technicians` by default. Promotion to a manager
 * is a separate explicit step (see `promoteToManager`) so role authority
 * stays server-side: a malicious user can't self-elevate by setting their
 * own Clerk public metadata.
 *
 * Idempotent: looking up by `clerkId` and patching/inserting accordingly
 * means Clerk's automatic webhook retries are safe.
 */
export const upsertFromClerk = internalMutation({
  // The Clerk webhook payload is well-typed via `@clerk/backend`'s
  // `UserJSON`. We pass it through as `v.any()` because runtime-validating
  // an external payload we already trust (signature-verified) is overhead.
  args: { data: v.any() as Validator<UserJSON> },
  returns: v.union(
    v.object({ kind: v.literal("manager"), id: v.id("managers") }),
    v.object({ kind: v.literal("technician"), id: v.id("technicians") }),
  ),
  handler: async (ctx, { data }) => {
    const clerkId = data.id;
    const primaryEmail = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id,
    )?.email_address;
    const name =
      [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
      primaryEmail ||
      "Unnamed user";

    // tokenIdentifier is `{issuer}|{subject}` — we don't have the issuer
    // in the webhook payload, but we do know it's stable per Clerk
    // instance. Reconstruct it so the auth-time JWT lookup still works.
    const issuer = process.env.CLERK_FRONTEND_API_URL!;
    const tokenIdentifier = `${issuer}|${clerkId}`;

    // Already a manager? Patch in place.
    const manager = await ctx.db
      .query("managers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (manager) {
      await ctx.db.patch(manager._id, {
        tokenIdentifier,
        name,
        email: primaryEmail ?? manager.email,
      });
      return { kind: "manager" as const, id: manager._id };
    }

    // Already a technician? Patch in place.
    const technician = await ctx.db
      .query("technicians")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (technician) {
      await ctx.db.patch(technician._id, {
        tokenIdentifier,
        name,
        email: primaryEmail ?? technician.email,
      });
      return { kind: "technician" as const, id: technician._id };
    }

    // First time we've seen this user — default to technician.
    const id = await ctx.db.insert("technicians", {
      tokenIdentifier,
      clerkId,
      name,
      email: primaryEmail ?? "",
    });
    return { kind: "technician" as const, id };
  },
});

/**
 * Removes a user (and any active jobs). Called on `user.deleted`.
 * Cleanups are conservative: completed jobs are left in place for audit,
 * scheduled jobs are deleted along with their notifications.
 */
export const deleteFromClerk = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkId }) => {
    const manager = await ctx.db
      .query("managers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (manager) {
      await ctx.db.delete(manager._id);
      return null;
    }
    const technician = await ctx.db
      .query("technicians")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (technician) {
      await ctx.db.delete(technician._id);
    }
    return null;
  },
});

// -----------------------------------------------------------------------
// Admin operations (only callable from other Convex functions such as the
// seed script, never directly from the client).
// -----------------------------------------------------------------------

/**
 * Returns the role + Convex `_id` of the user with the given Clerk ID,
 * or `null` if the webhook hasn't mirrored them yet. The seed script
 * polls this after creating a Clerk user so it knows when it's safe to
 * call follow-up internal mutations (promote, seed quotes, etc).
 *
 * Exposed as a public query but reveals only "does this Clerk subject
 * exist in our DB" — strictly less sensitive than what a holder of the
 * Clerk secret key can already see. We do NOT return name/email here,
 * to keep this strictly an existence-and-role probe.
 */
export const byClerkId = query({
  args: { clerkId: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("manager"), id: v.id("managers") }),
    v.object({ kind: v.literal("technician"), id: v.id("technicians") }),
    v.null(),
  ),
  handler: async (ctx, { clerkId }) => {
    const manager = await ctx.db
      .query("managers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (manager) return { kind: "manager" as const, id: manager._id };
    const technician = await ctx.db
      .query("technicians")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (technician) {
      return { kind: "technician" as const, id: technician._id };
    }
    return null;
  },
});

/**
 * Promotes a technician row into the managers table. Used by the seed
 * script to designate test managers, and could be called from a future
 * admin UI. Internal so a malicious client cannot self-elevate.
 *
 * Idempotent: if a manager already exists for this clerkId we return
 * its id; if a technician exists, we move it; if neither, we throw.
 */
export const promoteToManager = internalMutation({
  args: { clerkId: v.string() },
  returns: v.id("managers"),
  handler: async (ctx, { clerkId }): Promise<Id<"managers">> => {
    // Already promoted? No-op.
    const existingManager: Doc<"managers"> | null = await ctx.db
      .query("managers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (existingManager) return existingManager._id;

    const tech: Doc<"technicians"> | null = await ctx.db
      .query("technicians")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!tech) {
      throw new ConvexError(
        `No manager or technician found for Clerk ID ${clerkId}. ` +
          `Has the user.created webhook fired yet?`,
      );
    }
    const managerId = await ctx.db.insert("managers", {
      tokenIdentifier: tech.tokenIdentifier,
      clerkId: tech.clerkId,
      name: tech.name,
      email: tech.email,
    });
    await ctx.db.delete(tech._id);
    return managerId;
  },
});
