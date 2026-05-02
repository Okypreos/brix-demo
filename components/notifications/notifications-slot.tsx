"use client";

import { Authenticated } from "convex/react";
import { Bell } from "lucide-react";

import { NotificationBell } from "./notification-bell";
import { NotificationToastBridge } from "./notification-toast-bridge";
import { Button } from "@/components/ui/button";

// Bell + toast bridge, gated on Convex `<Authenticated>`. Without the
// gate, the inner `useQuery(api.notifications.*)` calls would fire
// during the sign-out transition and throw UNAUTHENTICATED before the
// redirect lands. See https://docs.convex.dev/auth/clerk.
export function NotificationsSlot() {
  return (
    <>
      <Authenticated>
        <NotificationToastBridge />
      </Authenticated>
      <Authenticated>
        <NotificationBell />
      </Authenticated>
    </>
  );
}

// Bell-shaped placeholder. Unused by `NotificationsSlot` (which renders
// nothing during the transient auth gap), but kept for callers that
// want to opt into a placeholder via explicit auth boundaries.
export function NotificationBellPlaceholder() {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-hidden
      tabIndex={-1}
      className="relative pointer-events-none opacity-50"
    >
      <Bell className="size-5" />
    </Button>
  );
}
