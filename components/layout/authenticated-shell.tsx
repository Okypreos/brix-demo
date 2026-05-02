"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton";

// Convex auth boundary for workspace `<main>` content.
//
// Without this, every auth-gated `useQuery` in a workspace page would
// fire one last unauthenticated request during the sign-out transition
// (Clerk flips signed-out -> Convex flips unauthenticated -> our
// `requireCurrentUser` throws UNAUTHENTICATED -> noisy console error).
//
// `<Authenticated>` unmounts children the moment Convex auth changes,
// so no auth-gated query is ever issued without a token. Canonical
// pattern from https://docs.convex.dev/auth/clerk.
//
// `<Unauthenticated>` renders null on purpose — the layout's RoleGate
// is the source of truth for "should this page render", and a sign-in
// CTA here would just race the redirect.
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

// Mirrors the rough silhouette of dashboard / quotes / schedule pages
// so whichever page lands looks like a sensible follow-up. Visible at
// most a frame or two while Convex confirms the Clerk token.
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
