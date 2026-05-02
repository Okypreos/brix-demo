"use client";

import { useQuery } from "convex/react";
import { ClipboardList } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteCard } from "./quote-card";
import type { Quote, QuoteStatus } from "@/lib/types";

// Reactive grid of quote cards. `status` filters server-side via the
// by_status index; undefined shows all (newest first, capped at 100).
export function QuotesGrid({
  status,
  emptyMessage,
}: {
  status?: QuoteStatus;
  emptyMessage: string;
}) {
  const quotes = useQuery(api.quotes.list, status ? { status } : {});

  if (quotes === undefined) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
        <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <ClipboardList className="size-5" />
        </div>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {quotes.map((quote: Quote) => (
        <QuoteCard key={quote._id} quote={quote} />
      ))}
    </div>
  );
}
