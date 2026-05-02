import { Badge } from "@/components/ui/badge";
import type { QuoteStatus } from "@/lib/types";

// Centralized status -> label/variant mapping so every surface that
// displays a quote renders status the same way.
const STATUS_LABEL: Record<QuoteStatus, string> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  completed: "Completed",
};

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
