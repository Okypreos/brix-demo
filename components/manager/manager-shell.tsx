import { UserButton } from "@clerk/nextjs";
import { ManagerSidebar } from "./sidebar";
import type { CurrentManager } from "@/lib/auth/types";

/**
 * The visual frame for the manager workspace.
 *
 * Layout: a CSS grid with a fixed sidebar column and a flexible main
 * column. The sidebar is sticky so navigation stays put while pages
 * scroll. Future steps can drop additional widgets (notification bell,
 * date selector, etc.) into the header without restructuring.
 *
 * The sidebar is split into its own client component because it needs
 * `usePathname` to highlight the active route; everything else here is
 * static and stays in a Server Component for free SSR.
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
            <UserButton />
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
