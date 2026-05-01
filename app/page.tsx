import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { LandingHero } from "@/components/landing/landing-hero";

/**
 * Landing page.
 *
 * Three states, all resolved on the **server** so signed-in users
 * never see a flash of the marketing hero before being redirected:
 *
 * 1. Signed-out: render `<LandingHero/>` (marketing + sign-in CTAs).
 * 2. Signed-in as a manager: redirect to `/dashboard`.
 * 3. Signed-in as a technician: redirect to `/schedule`.
 *
 * Edge case — signed-in but Convex row not yet mirrored (the Clerk
 * `user.created` webhook can lag a few hundred ms after a fresh
 * sign-up): we render a small "syncing your account" card *here*
 * rather than redirecting. If we redirected to a workspace, that
 * layout's own gate would bounce the user right back to `/`, causing
 * a redirect loop. The card is shown only for the brief webhook
 * window; the user can refresh once it lands. (We could subscribe to
 * `users.current` reactively and auto-redirect when it resolves, but
 * a manual refresh is fine for this rare case and keeps this page a
 * pure server component.)
 *
 * Why server-side instead of client-side `<Authenticated>` wrappers:
 *  - No flash of the welcome card or hero before the redirect.
 *  - Matches the same pattern used by `app/(manager)/layout.tsx` and
 *    `app/(technician)/layout.tsx`.
 *  - Pure server work — no client JS for the redirect path.
 *
 * Reference: https://docs.convex.dev/client/nextjs/app-router/server-rendering
 */
export default async function Home() {
  const { userId, getToken } = await auth();

  if (!userId) {
    return <LandingHero />;
  }

  // Use Clerk's *default* session token (no JWT template) — same
  // reasoning as in `app/(manager)/layout.tsx`. The Convex+Clerk
  // integration maps `aud: "convex"` into the default token.
  const token = (await getToken()) ?? undefined;
  const me = await fetchQuery(api.users.current, {}, { token });

  if (me?.kind === "manager") {
    redirect("/dashboard");
  }
  if (me?.kind === "technician") {
    redirect("/schedule");
  }

  // me === null: webhook hasn't mirrored this Clerk user yet. Show a
  // friendly "syncing" card. The user typically just needs to wait a
  // moment and refresh.
  return (
    <div className="flex flex-1 flex-col bg-background">
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Setting up your account</CardTitle>
            <CardDescription>
              Just syncing your profile. Refresh this page in a moment.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}
