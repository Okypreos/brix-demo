import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCurrentUser } from "./lib/auth";

/**
 * In-app notifications.
 *
 * Notifications are written *atomically* by the mutation that triggers
 * them (see `jobs.assign`, `jobs.reschedule`, `jobs.complete`) — so a
 * job assignment and its "you have a new job" notification either both
 * commit or neither does. There's no separate worker, queue, or cron.
 * That's the entire "event-driven" story: Convex's serializable
 * transactions are the event bus.
 *
 * The client subscribes to `listForCurrentUser` and `unreadCount` via
 * `useQuery`. Convex's reactive query layer pushes invalidations
 * automatically whenever a write touches a row in the read set, so the
 * NotificationBell badge and the toast bridge update without any
 * polling on our side.
 *
 * For an optional out-of-band channel (email/push), we'd add an
 * `internalAction` invoked from the same mutations after the row
 * insert — out of scope for this take-home, but the notification table
 * is shaped so that's a small additive change.
 */

// -----------------------------------------------------------------------
// Validators (returned shape)
// -----------------------------------------------------------------------

const notificationValidator = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  recipientKind: v.union(v.literal("manager"), v.literal("technician")),
  recipientId: v.union(v.id("managers"), v.id("technicians")),
  kind: v.union(
    v.literal("job_assigned"),
    v.literal("job_updated"),
    v.literal("job_completed"),
  ),
  jobId: v.id("jobs"),
  message: v.string(),
  readAt: v.optional(v.number()),
});

// -----------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------

/**
 * Latest 50 notifications for the signed-in user, newest first.
 *
 * We deliberately don't paginate — for an in-app notification feed at
 * the scale of this app, "latest 50" is a good UX (anything older
 * really belongs in an email digest). The `take(50)` also bounds the
 * read set so the reactive subscription stays cheap on writes.
 */
export const listForCurrentUser = query({
  args: {},
  returns: v.array(notificationValidator),
  handler: async (ctx) => {
    const me = await requireCurrentUser(ctx);
    const myId: Id<"managers"> | Id<"technicians"> = me.doc._id;

    return await ctx.db
      .query("notifications")
      .withIndex("by_recipientId", (q) => q.eq("recipientId", myId))
      .order("desc")
      .take(50);
  },
});

/**
 * Unread count for the bell badge. Cheap, indexed, and read-set-bounded
 * so a write that flips a notification from unread → read invalidates
 * exactly the bells that need to update.
 *
 * We rely on the convention that "unread" === "readAt is missing".
 * Convex's index API lets us query `eq("readAt", undefined)` which
 * matches rows where the optional field is absent — see the schema
 * note next to `notifications`.
 */
export const unreadCountForCurrentUser = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const me = await requireCurrentUser(ctx);
    const myId: Id<"managers"> | Id<"technicians"> = me.doc._id;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipientId_and_readAt", (q) =>
        q.eq("recipientId", myId).eq("readAt", undefined),
      )
      .collect();
    return unread.length;
  },
});

// -----------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------

/**
 * Marks a single notification as read. Idempotent (re-marking a read
 * row is a no-op — the second writer doesn't trample the first
 * `readAt` timestamp). Authorized: the recipient only.
 */
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, { notificationId }) => {
    const me = await requireCurrentUser(ctx);

    const notif: Doc<"notifications"> | null = await ctx.db.get(notificationId);
    if (!notif) {
      // Returning silently for not-found keeps the client simple
      // (e.g. a stale popover row still resolves cleanly). The
      // alternative is to throw NOT_FOUND, but there's nothing
      // useful the user can do with that.
      return null;
    }

    if (notif.recipientId !== me.doc._id) {
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

/**
 * Bulk variant. Marks every unread notification for the caller as read
 * in a single transaction. A few hundred rows is well within Convex's
 * per-transaction limits; for a real product you'd cap with `.take()`
 * or paginate.
 */
export const markAllRead = mutation({
  args: {},
  returns: v.object({ marked: v.number() }),
  handler: async (ctx) => {
    const me = await requireCurrentUser(ctx);
    const myId: Id<"managers"> | Id<"technicians"> = me.doc._id;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_recipientId_and_readAt", (q) =>
        q.eq("recipientId", myId).eq("readAt", undefined),
      )
      .collect();

    const now = Date.now();
    for (const n of unread) {
      await ctx.db.patch(n._id, { readAt: now });
    }

    return { marked: unread.length };
  },
});
