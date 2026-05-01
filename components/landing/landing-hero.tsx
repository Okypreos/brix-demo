"use client";

import Link from "next/link";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowRight, CalendarClock, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Marketing landing page for signed-out visitors.
 *
 * Marked `"use client"` because Clerk's `<SignInButton/>` and
 * `<SignUpButton/>` (v7) require their child to be passed via React's
 * client-side child API — server-component prop serialization trips
 * Clerk's "single child" check (it sees the button + its inner JSX
 * separately rather than as a forwarded element). Keeping the whole
 * landing component on the client matches Clerk's documented usage
 * and is what the original `app/page.tsx` did before the split.
 *
 * Authenticated users never see this — `app/page.tsx` (server
 * component) redirects them to their workspace before rendering.
 */
export function LandingHero() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-widest uppercase"
        >
          Brix
        </Link>
        <div className="flex items-center gap-3">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm">Get started</Button>
          </SignUpButton>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-4xl flex-col items-center gap-12 text-center">
          <div className="flex flex-col items-center gap-6">
            <Badge variant="secondary" className="uppercase tracking-widest">
              Field service scheduling
            </Badge>
            <h1 className="max-w-3xl font-heading text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Assign quotes to technicians, without ever double-booking.
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Brix lets multiple managers schedule jobs onto a shared
              technician calendar with backend-enforced conflict prevention.
              Real-time notifications keep crews in sync.
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
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Brix Scheduling · Built with Next.js, Convex, Clerk, and shadcn/ui.
      </footer>
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
