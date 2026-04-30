import { Badge } from "@/components/ui/badge";
import type { QuoteStatus } from "@/lib/types";

/**
 * Visual badge for a quote's lifecycle status. Mapping is centralized
 * here so every surface that displays a quote (cards, dashboard, future
 * detail page) renders the status the same way.
 */
const STATUS_LABEL: Record<QuoteStatus, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  completed: "Completed",
};

// shadcn's <Badge> ships variants `default`, `secondary`, `destructive`,
// and `outline`. We'd add a custom semantic variant via cva, but keeping
// it constrained keeps the design language consistent.
const STATUS_VARIANT: Record<QuoteStatus, "default" | "secondary" | "outline"> = {
  unscheduled: "outline",
  scheduled: "default",
  completed: "secondary",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      className="uppercase tracking-widest"
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}
