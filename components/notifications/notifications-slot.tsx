"use client";

import { Authenticated } from "convex/react";
import { Bell } from "lucide-react";

import { NotificationBell } from "./notification-bell";
import { NotificationToastBridge } from "./notification-toast-bridge";
import { Button } from "@/components/ui/button";

/**
 * Renders the notification bell + toast bridge, but only while the
 * Convex client reports `authenticated`.
 *
 * Why this wrapper exists:
 *
 * `<NotificationBell/>` and `<NotificationToastBridge/>` both call
 * `useQuery(api.notifications.*)`, which reach `requireCurrentUser`
 * server-side and throw `UNAUTHENTICATED` when no Clerk token is
 * attached to the Convex client. There is a transient window during
 * sign-out (and, less frequently, during initial sign-in) where:
 *  - the Next.js server-rendered layout is still mounted,
 *  - but Convex's auth state has already flipped to `unauthenticated`,
 *  - so the in-flight queries fire without a token and surface a
 *    noisy `ConvexError` in the console before the redirect lands.
 *
 * Convex's `<Authenticated>` boundary is exactly the official escape
 * hatch for this — it only renders children while
 * `useConvexAuth().isAuthenticated === true`, so the queries simply
 * are not issued during transitions. See:
 *   https://docs.convex.dev/auth/clerk
 *
 * The shells (`ManagerShell`, `TechnicianShell`) are server components,
 * so we keep this client-only piece isolated here rather than forcing
 * the entire shell to `"use client"`.
 *
 * The "loading" placeholder is a non-interactive bell icon. It keeps
 * header layout stable across the auth transition and avoids a content
 * shift (and the placeholder is itself only visible for the brief
 * moment between Clerk resolving and Convex acknowledging — usually
 * one or two animation frames in practice).
 */
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

/**
 * A header-shaped placeholder for the bell while Convex auth is still
 * resolving. Not currently rendered by `NotificationsSlot` (the slot
 * intentionally renders nothing during the transient auth gap so the
 * UI doesn't flash a fake bell), but kept here so a future caller can
 * opt into a placeholder by composing `<Unauthenticated>` /
 * `<AuthLoading>` boundaries explicitly.
 */
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
