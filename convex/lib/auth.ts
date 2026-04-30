import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Returns the authenticated user as a discriminated union, or null if not
 * signed in.
 *
 * We look up by `clerkId` (the Clerk user subject) rather than by the
 * full `tokenIdentifier`. Both are stable per-user and we store both,
 * but the Clerk webhook only knows the user's Clerk ID — using `clerkId`
 * here keeps the JWT-time auth check and the webhook write keyed on the
 * same field, which avoids a class of subtle bugs (e.g. user appears
 * unauthenticated until tokenIdentifier is repaired by the next webhook).
 *
 * This is the only place that talks to `ctx.auth` directly; all mutations
 * and queries should go through these helpers so authorization logic
 * stays centralized.
 */
export async function getCurrentUser(
  ctx: QueryCtx,
): Promise<
  | { kind: "manager"; doc: Doc<"managers"> }
  | { kind: "technician"; doc: Doc<"technicians"> }
  | null
> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  // Clerk sets `sub` to the user ID (e.g. "user_2abc...").
  const clerkId = identity.subject;

  const manager = await ctx.db
    .query("managers")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();
  if (manager) return { kind: "manager", doc: manager };

  const technician = await ctx.db
    .query("technicians")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .unique();
  if (technician) return { kind: "technician", doc: technician };

  return null;
}

/**
 * Resolves the authenticated user or throws a typed error.
 *
 * Throwing `ConvexError` (rather than a plain Error) propagates a
 * structured payload to the client, so the UI can pattern-match on the
 * `code` field to render a friendly message.
 */
export async function requireCurrentUser(ctx: QueryCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to do that.",
    });
  }
  return user;
}

export async function requireManager(ctx: QueryCtx): Promise<Doc<"managers">> {
  const user = await requireCurrentUser(ctx);
  if (user.kind !== "manager") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Manager role required.",
    });
  }
  return user.doc;
}

export async function requireTechnician(
  ctx: QueryCtx,
): Promise<Doc<"technicians">> {
  const user = await requireCurrentUser(ctx);
  if (user.kind !== "technician") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Technician role required.",
    });
  }
  return user.doc;
}
