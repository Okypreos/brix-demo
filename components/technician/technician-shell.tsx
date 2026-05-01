import { UserButton } from "@clerk/nextjs";
import { TechnicianSidebar } from "./sidebar";
import { NotificationsSlot } from "@/components/notifications/notifications-slot";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import type { CurrentTechnician } from "@/lib/auth/types";

/**
 * The visual frame for the technician workspace. Mirrors `ManagerShell`
 * intentionally — same header layout, same sidebar grid — so the two
 * roles feel like one product, just with different nav and content.
 *
 * Auth boundaries:
 *  - `<NotificationsSlot/>` (header) wraps its own bell + toast bridge
 *    in `<Authenticated>` so the bell never fires unauthenticated
 *    queries during the sign-out transition.
 *  - `<AuthenticatedShell/>` wraps `children` (the page `<main>`
 *    content) in the same boundary, so every auth-gated `useQuery`
 *    on a technician page is automatically suppressed during the
 *    transient sign-out / sign-in window.
 */
export function TechnicianShell({
  user,
  children,
}: {
  user: CurrentTechnician;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[240px_1fr] bg-background">
      <TechnicianSidebar />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Technician
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
