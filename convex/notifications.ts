import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireCurrentUser } from "./lib/auth";

// In-app notifications.
//
// Notifications are written atomically by the mutation that triggers
// them (see jobs.assign / reschedule / complete) — job + notification
// commit together or neither does. No worker, no queue, no cron;
// Convex's serializable transactions are the event bus.
//
// The client subscribes via useQuery. Convex pushes invalidations when
// a write touches the read set, so the bell badge and toast bridge
// update without polling.

const notificationValidator = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  recipientId: v.id("users"),
  kind: v.union(
    v.literal("job_assigned"),
    v.literal("job_updated"),
    v.literal("job_completed"),
  ),
  jobId: v.id("jobs"),
  message: v.string(),
  readAt: v.optional(v.number()),
});

// Latest 50 notifications for the signed-in user, newest first.
// Take(50) bounds the read set so writes invalidate cheaply.
export const listForCurrentUser = query({
  args: {},
  returns: v.array(notificationValidator),
  handler: async (ctx) => {
    const me = await requireCurrentUser(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_recipientId", (q) => q.eq("recipientId", me._id))
      .order("desc")
      .take(50);
  },
});

// Unread count for the bell badge. `eq("readAt", undefined)` matches
// rows where the optional field is absent.
export const unreadCountForCurrentUser = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const me = await requireCurrentUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipientId_and_readAt", (q) =>
        q.eq("recipientId", me._id).eq("readAt", undefined),
      )
      .collect();
    return unread.length;
  },
});

// Marks one notification read. Idempotent. Recipient-only.
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, { notificationId }) => {
    const me = await requireCurrentUser(ctx);

    const notif: Doc<"notifications"> | null = await ctx.db.get(notificationId);
    // Silent on not-found so a stale popover row resolves cleanly.
    if (!notif) return null;

    if (notif.recipientId !== me._id) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only mark your own notifications.",
      });
    }

    if (notif.readAt !== undefined) return null;

    await ctx.db.patch(notificationId, { readAt: Date.now() });
    return null;
  },
});

// Bulk variant. Single transaction; for real volumes, paginate.
export const markAllRead = mutation({
  args: {},
  returns: v.object({ marked: v.number() }),
  handler: async (ctx) => {
    const me = await requireCurrentUser(ctx);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipientId_and_readAt", (q) =>
        q.eq("recipientId", me._id).eq("readAt", undefined),
      )
      .collect();

    const now = Date.now();
    for (const n of unread) {
      await ctx.db.patch(n._id, { readAt: now });
    }

    return { marked: unread.length };
  },
});
