"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useCurrentUser } from "@/lib/auth/use-current-user";
import type { User } from "@/lib/auth/types";
import { SyncingAccountCard } from "@/components/auth/syncing-account-card";

// The single place client-side role decisions are made. Manager and
// technician layouts wrap their shells in this gate.
//
// States:
//   auth resolving        -> spinner
//   signed-in, no row     -> SyncingAccountCard (webhook lag)
//   signed-out            -> replace("/") + spinner
//   wrong role            -> replace to correct workspace + spinner
//   right role            -> children(user)
//
// Render-prop API so the typed user flows straight to the shell.
//
// The security boundary is unchanged — every Convex function still
// calls requireRole server-side. This component only controls *what
// UI renders*, not what data the server returns.
type RoleGateProps = {
  role: "manager" | "technician";
  children: (user: User) => React.ReactNode;
};

export function RoleGate(props: RoleGateProps) {
  const router = useRouter();
  const { isLoading, isMissingRow, isAuthenticated, user } = useCurrentUser();

  // `replace` (not `push`) so back button doesn't return to a
  // workspace they no longer have access to.
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isMissingRow) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, isMissingRow, router]);

  // Depend on `user?.role`, not `user`, so this effect is stable
  // across unrelated re-renders of the user doc.
  const userRole = user?.role;
  useEffect(() => {
    if (userRole && userRole !== props.role) {
      router.replace(userRole === "manager" ? "/dashboard" : "/schedule");
    }
  }, [userRole, props.role, router]);

  if (isLoading) return <CenteredSpinner />;
  if (isMissingRow) return <SyncingAccountCard />;
  if (!user) return <CenteredSpinner />;
  if (user.role !== props.role) return <CenteredSpinner />;

  return <>{props.children(user)}</>;
}

function CenteredSpinner() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background"
      role="status"
      aria-live="polite"
      aria-label="Loading workspace"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
