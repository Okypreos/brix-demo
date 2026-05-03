"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RescheduleJobForm } from "@/components/forms/reschedule-job-form";
import { api } from "@/convex/_generated/api";
import type { Quote } from "@/lib/types";

// Modal wrapper for the reschedule form. Loads the underlying job
// from the quote (1:1 by schema), then hands it to the form. If the
// job has already started we lock the dialog with a clear message
// rather than letting the form throw a FORBIDDEN at submit time.
export function RescheduleQuoteDialog({
  quote,
  open,
  onOpenChange,
}: {
  quote: Quote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Skip the query until the dialog actually opens — saves a round
  // trip on every quote card render.
  const job = useQuery(
    api.jobs.getByQuoteId,
    open ? { quoteId: quote._id } : "skip",
  );

  const isLoading = open && job === undefined;
  const inProgress = job ? job.start <= Date.now() : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule {quote.title}</DialogTitle>
          <DialogDescription>
            Move this job to a new time window. The technician will be
            notified.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading job…
          </div>
        )}

        {!isLoading && !job && (
          <p className="py-4 text-sm text-muted-foreground">
            This quote no longer has a scheduled job.
          </p>
        )}

        {!isLoading && job && inProgress && (
          <p className="py-4 text-sm text-muted-foreground">
            This job has already started or finished and can no longer
            be rescheduled.
          </p>
        )}

        {!isLoading && job && !inProgress && (
          <RescheduleJobForm
            quote={quote}
            job={job}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
