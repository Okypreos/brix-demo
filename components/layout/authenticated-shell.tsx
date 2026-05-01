"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Convex auth boundary for the workspace `<main>` content.
 *
 * The manager and technician shells already enforce authentication
 * **server-side** in their layouts (`app/(manager)/layout.tsx` and
 * `app/(technician)/layout.tsx` redirect any unauthenticated request
 * to `/`). So in the happy path the user is already authenticated by
 * the time this component renders, and `<Authenticated>` is satisfied
 * on the very first frame — no flicker.
 *
 * What this guards against is the *client-side* transition window
 * during sign-out (and, more rarely, during initial sign-in):
 *
 *  - Clerk flips `useAuth()` to signed-out.
 *  - `ConvexProviderWithClerk` flips Convex auth to `unauthenticated`.
 *  - The Next.js layout is still mounted briefly before the redirect.
 *  - Every `useQuery(api.someAuthGatedFn)` rendered inside it would
 *    fire one last unauthenticated request — and our server-side
 *    helpers (`requireCurrentUser`, `requireManager`, `requireTech`)
 *    correctly throw `UNAUTHENTICATED`, surfacing as a noisy
 *    `ConvexError` in the console.
 *
 * Wrapping the workspace `children` in `<Authenticated>` causes those
 * children to unmount the moment Convex's auth state changes, so no
 * auth-gated query is ever issued without a token. This is the
 * recommended pattern in the Convex docs for Clerk integrations:
 *   https://docs.convex.dev/auth/clerk
 *
 * `<AuthLoading>` covers the brief moment between Convex booting and
 * acknowledging the Clerk token (usually one or two frames). We render
 * a minimal full-page skeleton so the layout doesn't jump.
 *
 * `<Unauthenticated>` is rendered as `null` on purpose. The Next.js
 * server-side layout gate is the source of truth for "should this page
 * even render"; if we somehow reach client-side `unauthenticated`, we
 * are already being redirected. Showing a sign-in CTA here would just
 * race the redirect and look broken.
 */
export function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Authenticated>{children}</Authenticated>
      <AuthLoading>
        <WorkspaceSkeleton />
      </AuthLoading>
      <Unauthenticated>{null}</Unauthenticated>
    </>
  );
}

/**
 * Generic "page is loading" shape for the workspace.
 *
 * It mirrors the rough silhouette of the most common pages
 * (dashboard's KPI strip + content area, quotes grid, schedule
 * calendar) so whatever page the user is about to see, the skeleton
 * looks like a sensible precursor to it. It never lingers — at most a
 * frame or two while Convex confirms the Clerk token.
 */
function WorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}
