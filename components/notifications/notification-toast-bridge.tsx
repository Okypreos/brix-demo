"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

type Notification = Doc<"notifications">;

// Fires a Sonner toast whenever a new notification arrives. Mount
// once near the top of an authenticated layout.
//
// "New" is anything strictly newer than a high-water mark we set on
// the first successful resolve. Avoids toasting historical rows on
// page load and re-toasting on navigation.
export function NotificationToastBridge() {
  const notifications = useQuery(api.notifications.listForCurrentUser);

  // null = not initialized yet.
  const watermarkRef = useRef<number | null>(null);

  useEffect(() => {
    if (notifications === undefined) return;

    // First resolve — set the watermark, don't toast.
    if (watermarkRef.current === null) {
      watermarkRef.current = notifications.reduce(
        (max: number, n: Notification) =>
          n._creationTime > max ? n._creationTime : max,
        0,
      );
      return;
    }

    // Toast anything newer, oldest-first so visual order matches
    // arrival order.
    const watermark = watermarkRef.current;
    const fresh: Notification[] = notifications
      .filter((n: Notification) => n._creationTime > watermark)
      .sort((a: Notification, b: Notification) => a._creationTime - b._creationTime);
    if (fresh.length === 0) return;

    for (const n of fresh) {
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
