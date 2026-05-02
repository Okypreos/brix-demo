import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { UserRole } from "../schema";

// Returns the signed-in user's row, or null if not signed in or if the
// Clerk webhook hasn't mirrored them into `users` yet.
//
// We key on `clerkId` (the JWT subject) so the auth-time read and the
// webhook-time write target the same field.
export async function getCurrentUser(
  ctx: QueryCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

// Throws UNAUTHENTICATED if not signed in.
export async function requireCurrentUser(
  ctx: QueryCtx,
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to do that.",
    });
  }
  return user;
}

// Single role gate. Every role-protected query/mutation calls this
// (directly or via the wrappers below).
export async function requireRole(
  ctx: QueryCtx,
  role: UserRole,
): Promise<Doc<"users">> {
  const user = await requireCurrentUser(ctx);
  if (user.role !== role) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `${role[0].toUpperCase()}${role.slice(1)} role required.`,
    });
  }
  return user;
}

export const requireManager = (ctx: QueryCtx) => requireRole(ctx, "manager");
export const requireTechnician = (ctx: QueryCtx) =>
  requireRole(ctx, "technician");
