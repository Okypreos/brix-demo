import { UserButton } from "@clerk/nextjs";
import { TechnicianSidebar } from "./sidebar";
import { NotificationsSlot } from "@/components/notifications/notifications-slot";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import type { User } from "@/lib/auth/types";

// Visual frame for the technician workspace. Mirrors ManagerShell so
// both roles feel like one product. AuthenticatedShell wraps children
// to suppress auth-gated useQuery calls during sign-out transitions.
export function TechnicianShell({
  user,
  children,
}: {
  user: User;
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
