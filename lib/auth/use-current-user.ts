"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

// Combines Clerk's auth state with the "user row mirrored into Convex"
// check, so we don't render UI that depends on the user doc before
// the Clerk webhook has written it.
//
// `isMissingRow` is split out so the UI can show "still syncing your
// account" instead of a hard auth-failed state when the webhook is
// slow or misconfigured.
//
// https://docs.convex.dev/auth/database-auth#waiting-for-current-user-to-be-stored
export function useCurrentUser() {
  const { isLoading: clerkLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current);
  const isWaitingForWebhook = isAuthenticated && user === undefined;
  const isMissingRow = isAuthenticated && user === null;

  return {
    isLoading: clerkLoading || isWaitingForWebhook,
    isMissingRow,
    isAuthenticated: isAuthenticated && user != null,
    user: user ?? null,
  };
}
