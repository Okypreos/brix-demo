"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

type Notification = Doc<"notifications">;

/**
 * Bridges Convex's reactive notification feed to Sonner toasts.
 *
 * Mount this once near the top of an authenticated layout. It has no
 * visible output — its only job is to fire a toast every time a new
 * notification appears for the current user.
 *
 * "New" is defined relative to a high-water mark we set on first
 * successful query resolution. That avoids two annoying behaviours:
 *  1. Toasting every historical notification on page load.
 *  2. Re-toasting the same notification when the user navigates
 *     between pages (the query just re-resolves with the same data;
 *     the watermark prevents anything from looking "new").
 *
 * Convex's reactivity gives us the diff for free: the moment a
 * mutation inserts a notification anywhere in the system, this query
 * re-fires within a handful of ms with the new row prepended, and we
 * fire a toast immediately.
 */
export function NotificationToastBridge() {
  const notifications = useQuery(api.notifications.listForCurrentUser);

  // High-water mark: the largest `_creationTime` we've already
  // surfaced. `null` means "we haven't initialized the watermark yet".
  const watermarkRef = useRef<number | null>(null);

  useEffect(() => {
    if (notifications === undefined) return;

    // First resolve: set the watermark without toasting anything.
    if (watermarkRef.current === null) {
      watermarkRef.current = notifications.reduce(
        (max: number, n: Notification) =>
          n._creationTime > max ? n._creationTime : max,
        0,
      );
      return;
    }

    // Subsequent resolves: toast anything strictly newer than the
    // mark, oldest-first so the visual order matches arrival order.
    const watermark = watermarkRef.current;
    const fresh: Notification[] = notifications
      .filter((n: Notification) => n._creationTime > watermark)
      .sort((a: Notification, b: Notification) => a._creationTime - b._creationTime);
    if (fresh.length === 0) return;

    for (const n of fresh) {
      // Prefix the toast title by kind so reviewers see at a glance
      // what fired. Body keeps the message text from the mutation.
      const title =
        n.kind === "job_assigned"
          ? "New job assigned"
          : n.kind === "job_updated"
            ? "Job updated"
            : "Job completed";
      toast(title, { description: n.message });
    }

    watermarkRef.current = fresh[fresh.length - 1]._creationTime;
  }, [notifications]);

  return null;
}
