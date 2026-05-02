"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
} from "convex/react";
import { Loader2 } from "lucide-react";

import { useCurrentUser } from "@/lib/auth/use-current-user";
import { LandingHero } from "@/components/landing/landing-hero";
import { SyncingAccountCard } from "@/components/auth/syncing-account-card";

//   signed-out  -> <LandingHero>
//   loading     -> spinner
//   signed-in   -> redirect to correct workspace (or syncing card
//                  while waiting for the user webhook)
//
// All client because the previous server-rendered redirect chain
// raced with Clerk's post-sign-in router.refresh() and left users
// stuck on the landing page until F5.
export default function Home() {
  return (
    <>
      <Unauthenticated>
        <LandingHero />
      </Unauthenticated>
      <AuthLoading>
        <CenteredSpinner />
      </AuthLoading>
      <Authenticated>
        <AuthenticatedHomeRedirect />
      </Authenticated>
    </>
  );
}

// Runs inside <Authenticated>, so Convex has the Clerk JWT. Redirects
// to the right workspace, or shows the syncing card while waiting on
// the user webhook. router.replace lives in useEffect (side effects
// can't run during render).
function AuthenticatedHomeRedirect() {
  const router = useRouter();
  const { isMissingRow, user } = useCurrentUser();

  const userRole = user?.role;
  useEffect(() => {
    if (userRole === "manager") {
      router.replace("/dashboard");
    } else if (userRole === "technician") {
      router.replace("/schedule");
    }
  }, [userRole, router]);

  if (isMissingRow) {
    return <SyncingAccountCard />;
  }

  return <CenteredSpinner />;
}

function CenteredSpinner() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
