"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Combines Clerk's auth state with the "user row mirrored into Convex"
 * check, so we don't render UI that depends on the Convex user document
 * before the Clerk webhook has actually written it.
 *
 * Returns:
 * - `isLoading: true` while either Clerk or the Convex query is in flight,
 *   or while a freshly-signed-up user is waiting for the webhook to land.
 * - `isAuthenticated: true` only when both Clerk says signed-in AND the
 *   Convex user row exists.
 * - `user`: the discriminated-union user doc once available.
 *
 * See https://docs.convex.dev/auth/database-auth#waiting-for-current-user-to-be-stored
 */
export function useCurrentUser() {
  const { isLoading: clerkLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current);
  const isWaitingForWebhook = isAuthenticated && user === undefined;
  const isMissingRow = isAuthenticated && user === null;

  return {
    isLoading: clerkLoading || isWaitingForWebhook,
    // We expose `isMissingRow` separately so the UI can show a "still
    // syncing your account" message rather than a hard auth-failed state
    // if the webhook is unusually slow or misconfigured.
    isMissingRow,
    isAuthenticated: isAuthenticated && user != null,
    user: user ?? null,
  };
}
