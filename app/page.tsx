"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import {
  AuthLoading,
  Authenticated,
  Unauthenticated,
} from "convex/react";
import { ArrowRight, CalendarClock, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/lib/auth/use-current-user";

/**
 * Landing page.
 *
 * Three states:
 * 1. Signed-out: hero + sign-in / sign-up CTAs.
 * 2. Signed-in but Convex row not yet mirrored (webhook in flight): a
 *    skeleton placeholder. Usually only seen for a few hundred ms after
 *    a fresh sign-up.
 * 3. Signed-in and mirrored: a role-aware welcome card with a CTA to
 *    the appropriate workspace (manager dashboard or technician schedule).
 *
 * We use Convex's <Authenticated> / <Unauthenticated> components rather
 * than Clerk's <SignedIn> / <SignedOut> for the role-dependent UI because
 * Convex's helpers wait until the JWT has been validated by our backend
 * (per the docs: useConvexAuth is the source of truth for "auth ready
 * for Convex queries", not Clerk's useAuth).
 */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <Unauthenticated>
          <SignedOutHero />
        </Unauthenticated>
        <AuthLoading>
          <WelcomeCardSkeleton />
        </AuthLoading>
        <Authenticated>
          <SignedInPanel />
        </Authenticated>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Brix Scheduling · Built with Next.js, Convex, Clerk, and shadcn/ui.
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link
        href="/"
        className="font-heading text-lg font-semibold tracking-widest uppercase"
      >
        Brix
      </Link>
      <div className="flex items-center gap-3">
        {/*
         * We use Convex's <Authenticated>/<Unauthenticated> here rather than
         * Clerk's <Show when="signed-in"> because <Show> is an async server
         * component (per @clerk/nextjs 7.x types) and cannot be rendered
         * inside this "use client" page. Convex's wrappers also have the
         * advantage of waiting for the JWT to be validated by the backend,
         * not just present on the client.
         */}
        <Unauthenticated>
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm">Get started</Button>
          </SignUpButton>
        </Unauthenticated>
        <Authenticated>
          <UserButton />
        </Authenticated>
      </div>
    </header>
  );
}

function SignedOutHero() {
  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-12 text-center">
      <div className="flex flex-col items-center gap-6">
        <Badge variant="secondary" className="uppercase tracking-widest">
          Field service scheduling
        </Badge>
        <h1 className="max-w-3xl font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Assign quotes to technicians, without ever double-booking.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Brix lets multiple managers schedule jobs onto a shared technician
          calendar with backend-enforced conflict prevention. Real-time
          notifications keep crews in sync.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <SignUpButton mode="modal">
            <Button size="lg">
              Create an account
              <ArrowRight className="ml-1" />
            </Button>
          </SignUpButton>
          <SignInButton mode="modal">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </SignInButton>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-3">
        <FeatureCard
          icon={<ShieldCheck />}
          title="No double-booking"
          body="Conflict checks run inside serializable Convex mutations, so concurrent assignments can never overlap a technician's schedule."
        />
        <FeatureCard
          icon={<Zap />}
          title="Realtime by default"
          body="Reactive subscriptions push schedule changes and notifications to every browser the moment a job is created or completed."
        />
        <FeatureCard
          icon={<CalendarClock />}
          title="Two-hour windows"
          body="Pick a start time, the default 2-hour duration covers most jobs — override to 1, 4, or any custom length when needed."
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card size="sm" className="text-left">
      <CardHeader>
        <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground [&_svg]:size-4">
          {icon}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>{body}</CardDescription>
      </CardContent>
    </Card>
  );
}

function SignedInPanel() {
  const { isLoading, isMissingRow, user } = useCurrentUser();

  if (isLoading) {
    return <WelcomeCardSkeleton />;
  }

  // Webhook hasn't landed yet — almost never seen because <AuthLoading>
  // covers the JWT-pending window, but possible for very fresh signups.
  if (isMissingRow || !user) {
    return (
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Setting up your account</CardTitle>
          <CardDescription>
            Just syncing your profile. This page will refresh in a moment.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isManager = user.kind === "manager";
  const targetHref = isManager ? "/dashboard" : "/schedule";
  const targetLabel = isManager ? "Open dashboard" : "Open my schedule";
  const roleLabel = isManager ? "Manager" : "Technician";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <Badge variant="secondary" className="w-fit uppercase tracking-widest">
          {roleLabel}
        </Badge>
        <CardTitle className="mt-3">Welcome back, {user.name}</CardTitle>
        <CardDescription>
          {isManager
            ? "Pick up where you left off — assign unscheduled quotes, monitor jobs in flight, and review completed work."
            : "Your upcoming jobs and the calendar that drives them are one click away."}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-col items-stretch gap-2">
        <Button asChild>
          <Link href={targetHref}>
            {targetLabel}
            <ArrowRight className="ml-1" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function WelcomeCardSkeleton() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </CardHeader>
      <CardFooter>
        <Skeleton className="h-10 w-full" />
      </CardFooter>
    </Card>
  );
}
