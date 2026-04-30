"use client";

import { useQuery } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

/**
 * Reactive KPI strip on the dashboard.
 *
 * Subscribed to `quotes.counts` so the moment a quote is created (or a
 * job is completed in a later step) the numbers tick. Loading state
 * uses skeletons so the layout doesn't jump when the data arrives.
 */
export function DashboardKpis() {
  const counts = useQuery(api.quotes.counts);
  const isLoading = counts === undefined;

  const items = [
    { label: "Unscheduled", value: counts?.unscheduled, tone: "warning" as const },
    { label: "Scheduled", value: counts?.scheduled, tone: "info" as const },
    { label: "Completed", value: counts?.completed, tone: "success" as const },
    { label: "Total quotes", value: counts?.total, tone: "neutral" as const },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3"
        >
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {item.label}
          </span>
          {isLoading ? (
            <Skeleton className="mt-1 h-7 w-12" />
          ) : (
            <span className="font-heading text-2xl font-semibold tabular-nums">
              {item.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
