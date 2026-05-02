import { UserButton } from "@clerk/nextjs";
import { ManagerSidebar } from "./sidebar";
import { NotificationsSlot } from "@/components/notifications/notifications-slot";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import type { User } from "@/lib/auth/types";

// Visual frame for the manager workspace. Sticky sidebar + scrolling
// main. AuthenticatedShell wraps `children` so every auth-gated
// useQuery on every manager page is suppressed during the sign-out
// transition without per-page wrapping.
export function ManagerShell({
  user,
  children,
}: {
  user: User;
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
