import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { ManagerShell } from "@/components/manager/manager-shell";

/**
 * Server-side gate for the manager workspace.
 *
 * We resolve the user's role on the server (Clerk + a Convex query) so
 * non-managers never see a flash of the dashboard before being redirected.
 * Two relevant cases:
 *
 *  - Not signed in -> redirect to `/`. The landing page has the sign-in
 *    modal, so users land there with the obvious next step.
 *  - Signed in as a technician -> redirect to `/schedule`. Until that
 *    route exists (Step 8) we send them to `/` instead.
 *
 * Everything beyond the gate gets the shared shell (sidebar + header).
 */
export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, getToken } = await auth();
  if (!userId) {
    redirect("/");
  }

  // Use Clerk's *default* session token, not a JWT template. With the
  // current Convex+Clerk integration (Convex >= 1.34, Clerk v7) you
  // activate the "Convex integration" in the Clerk dashboard, which
  // automatically maps `aud: "convex"` into the default session token —
  // matching the `applicationID` in `convex/auth.config.ts`. Asking for
  // `getToken({ template: "convex" })` would try to look up a JWT
  // template by that name and return a Clerk 404 if it doesn't exist
  // (which it usually doesn't anymore — the integration replaced it).
  // See https://clerk.com/docs/guides/development/integrations/databases/convex
  const token = (await getToken()) ?? undefined;
  const me = await fetchQuery(api.users.current, {}, { token });

  if (!me) {
    // Webhook hasn't landed yet — extremely rare on a navigation, but
    // possible for a freshly-created account. Bounce to the landing
    // page where the client-side `useCurrentUser` hook displays a
    // friendly "syncing your account" message.
    redirect("/");
  }

  if (me.kind !== "manager") {
    // Eventually `redirect("/schedule")`. Until the technician route
    // group exists we send them to the landing page.
    redirect("/");
  }

  return <ManagerShell user={me}>{children}</ManagerShell>;
}
