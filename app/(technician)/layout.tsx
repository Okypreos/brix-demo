import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { TechnicianShell } from "@/components/technician/technician-shell";

/**
 * Server-side gate for the technician workspace.
 *
 * Mirrors `app/(manager)/layout.tsx` symmetrically:
 *  - Not signed in    -> redirect to `/`
 *  - Signed in as manager -> redirect to `/dashboard`
 *  - Webhook not yet  -> redirect to `/` so the server-rendered home
 *    page shows the "syncing your account" card
 *  - Otherwise        -> render the shared TechnicianShell
 *
 * Resolving role on the server prevents non-technicians from seeing a
 * flash of the schedule before being bounced.
 */
export default async function TechnicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, getToken } = await auth();
  if (!userId) {
    redirect("/");
  }

  const token = (await getToken()) ?? undefined;
  const me = await fetchQuery(api.users.current, {}, { token });

  if (!me) {
    redirect("/");
  }

  if (me.kind !== "technician") {
    redirect("/dashboard");
  }

  return <TechnicianShell user={me}>{children}</TechnicianShell>;
}
