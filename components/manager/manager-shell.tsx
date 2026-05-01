import { UserButton } from "@clerk/nextjs";
import { ManagerSidebar } from "./sidebar";
import { NotificationsSlot } from "@/components/notifications/notifications-slot";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import type { CurrentManager } from "@/lib/auth/types";

/**
 * The visual frame for the manager workspace.
 *
 * Layout: a CSS grid with a fixed sidebar column and a flexible main
 * column. The sidebar is sticky so navigation stays put while pages
 * scroll.
 *
 * Client components composed in:
 *  - <ManagerSidebar/>     — uses usePathname for active highlighting.
 *  - <NotificationsSlot/>  — wraps the bell + toast bridge inside a
 *                            Convex `<Authenticated>` boundary so the
 *                            auth-gated `notifications.*` queries are
 *                            never called during the brief sign-out /
 *                            sign-in transition.
 *  - <AuthenticatedShell/> — same boundary, but for the page `children`.
 *                            Means *every* auth-gated `useQuery` on a
 *                            manager page is automatically suppressed
 *                            during the transient sign-out window — no
 *                            per-page wrapping required.
 */
export function ManagerShell({
  user,
  children,
}: {
  user: CurrentManager;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[240px_1fr] bg-background">
      <ManagerSidebar />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Manager
            </span>
            <span className="text-sm font-medium">{user.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsSlot />
            <UserButton />
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden px-6 py-8">
          <AuthenticatedShell>{children}</AuthenticatedShell>
        </main>
      </div>
    </div>
  );
}
