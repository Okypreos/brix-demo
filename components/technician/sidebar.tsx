"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

// Technician sidebar nav. Single entry today, kept as an array so
// adding "Profile" / "History" later is a one-liner.
const NAV: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: "exact" | "prefix";
}> = [
  {
    href: "/schedule",
    label: "Schedule",
    icon: CalendarDays,
    match: "prefix",
  },
];

export function TechnicianSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col md:sticky md:top-0 md:h-dvh border-r border-border bg-card">
      <div className="px-6 py-5">
        <Link
          href="/schedule"
          className="block font-heading text-lg font-semibold tracking-widest uppercase"
        >
          Brix
        </Link>
        <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
          Field
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV.map((item) => {
          const active =
            item.match === "exact"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-4 text-xs text-muted-foreground border-t border-border">
        Demo Scheduling
      </div>
    </aside>
  );
}
