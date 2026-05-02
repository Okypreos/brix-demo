import { ConvexError, v, type Validator } from "convex/values";
import type { UserJSON } from "@clerk/backend";
import { internalMutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser, requireManager } from "./lib/auth";

const userValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  tokenIdentifier: v.string(),
  clerkId: v.string(),
  name: v.string(),
  email: v.string(),
  role: v.union(v.literal("manager"), v.literal("technician")),
  color: v.optional(v.string()),
});

// Subscribed to from the client to know whether the Clerk user has
// been mirrored into Convex yet (the webhook can lag a few hundred ms).
// Consumers branch on `user.role` to decide what to render.
export const current = query({
  args: {},
  returns: v.union(userValidator, v.null()),
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

// All technicians. Used by the assign-job dropdown and the technicians
// grid. Capped at 200 — would paginate at real scale.
export const listTechnicians = query({
  args: {},
  returns: v.array(userValidator),
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "technician"))
      .take(200);
  },
});

// Single technician by id. Manager-only.
//
// Returns null when the row is missing or when the id resolves to a
// non-technician — defensive, so a manager id reaching this URL 404s
// rather than leaking a manager profile.
export const getTechnician = query({
  args: { id: v.id("users") },
  returns: v.union(userValidator, v.null()),
  handler: async (ctx, { id }) => {
    await requireManager(ctx);
    const user = await ctx.db.get(id);
    if (!user || user.role !== "technician") return null;
    return user;
  },
});

// Webhook-driven mutations. Only callable from convex/http.ts via the
// signature-verified Clerk webhook — never from the public API.

// Mirrors a Clerk user into Convex. Called on user.created/updated.
// New users default to "technician"; promotion is a separate explicit
// step (`promoteToManager`) so users can't self-elevate via Clerk
// metadata. Idempotent.
export const upsertFromClerk = internalMutation({
  // Webhook payload is signature-verified upstream. v.any avoids the
  // overhead of re-validating something we already trust.
  args: { data: v.any() as Validator<UserJSON> },
  returns: v.id("users"),
  handler: async (ctx, { data }): Promise<Id<"users">> => {
    const clerkId = data.id;
    const primaryEmail = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id,
    )?.email_address;
    const name =
      [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
      primaryEmail ||
      "Unnamed user";

    const issuer = process.env.CLERK_FRONTEND_API_URL!;
    const tokenIdentifier = `${issuer}|${clerkId}`;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      // Don't touch role here. Promotions/demotions go through
      // `promoteToManager` so a stale webhook can't accidentally
      // demote a manager.
      await ctx.db.patch(existing._id, {
        tokenIdentifier,
        name,
        email: primaryEmail ?? existing.email,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier,
      clerkId,
      name,
      email: primaryEmail ?? "",
      role: "technician",
    });
  },
});

// Removes a user. Called on user.deleted. Historical jobs/notifications
// are left in place for audit; a real product with stricter retention
// would scrub or anonymise them here.
export const deleteFromClerk = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (user) {
      await ctx.db.delete(user._id);
    }
    return null;
  },
});

// Existence-and-role probe by Clerk ID. The seed action polls this
// after creating a Clerk user to know when the webhook has landed.
// Returns less info than a holder of the Clerk secret can already see.
export const byClerkId = query({
  args: { clerkId: v.string() },
  returns: v.union(
    v.object({
      id: v.id("users"),
      role: v.union(v.literal("manager"), v.literal("technician")),
    }),
    v.null(),
  ),
  handler: async (ctx, { clerkId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return null;
    return { id: user._id, role: user.role };
  },
});

// In-place role bump. Used by the seed script and could back a future
// admin UI. Internal — clients can't self-elevate.
//
// Single-table win: an FK like `jobs.technicianId` keeps pointing at
// the same row, so a tech-with-history promoted to manager carries
// their entire history with them. No row migration, no orphaned refs.
export const promoteToManager = internalMutation({
  args: { clerkId: v.string() },
  returns: v.id("users"),
  handler: async (ctx, { clerkId }): Promise<Id<"users">> => {
    const user: Doc<"users"> | null = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) {
      throw new ConvexError(
        `No user found for Clerk ID ${clerkId}. ` +
          `Has the user.created webhook fired yet?`,
      );
    }
    if (user.role !== "manager") {
      await ctx.db.patch(user._id, { role: "manager" });
    }
    return user._id;
  },
});
