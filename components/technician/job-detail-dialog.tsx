"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { CheckCircle2, MapPin, User } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatJobWindow, formatRelativeTime } from "@/lib/format/datetime";

/**
 * Modal showing the full details of a single job and a "Mark complete"
 * action when the job is still scheduled.
 *
 * Data: the parent passes the *already-hydrated* job + quote (from
 * the calendar's `listWithQuotes` query). That keeps this component
 * a pure consumer — no extra subscriptions, no auth concerns about
 * a separate `quotes.get` for technicians. The cost is that if the
 * underlying job changes while the dialog is open, the dialog won't
 * update (the parent's calendar query will, though, and the next
 * open will be fresh). For a "click-to-complete" interaction this
 * is the right trade-off.
 *
 * Closing rules:
 *  - The dialog respects the parent's open state.
 *  - The "Mark complete" mutation closes the dialog on success.
 *  - We block close while the mutation is in flight.
 */
export type JobDetail = {
  jobId: Id<"jobs">;
  start: number;
  end: number;
  status: "scheduled" | "completed";
  completedAt?: number;
  quote: {
    title: string;
    description: string;
    customerName: string;
    customerAddress?: string;
  };
};

export function JobDetailDialog({
  job,
  open,
  onOpenChange,
}: {
  job: JobDetail | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const completeJob = useMutation(api.jobs.complete);
  const [submitting, setSubmitting] = useState(false);

  async function onComplete() {
    if (!job) return;
    setSubmitting(true);
    try {
      await completeJob({ jobId: job.jobId });
      toast.success("Job marked complete");
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof ConvexError && typeof err.data === "object"
          ? (err.data as { message?: string }).message ??
            "Could not mark complete."
          : "Could not mark complete.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Block close while the mutation is in flight.
        if (submitting && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {job ? (
          <>
            <DialogHeader>
              <DialogTitle>{job.quote.title}</DialogTitle>
              <DialogDescription>
                {formatJobWindow(job.start, job.end)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <StatusBadge status={job.status} />
                {job.status === "completed" && job.completedAt ? (
                  <span className="text-xs text-muted-foreground">
                    Completed {formatRelativeTime(job.completedAt)}
                  </span>
                ) : null}
              </div>

              <Separator />

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <User className="size-3.5" /> Customer
                </dt>
                <dd>{job.quote.customerName}</dd>
                {job.quote.customerAddress ? (
                  <>
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5" /> Address
                    </dt>
                    <dd>{job.quote.customerAddress}</dd>
                  </>
                ) : null}
              </dl>

              {job.quote.description ? (
                <>
                  <Separator />
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {job.quote.description}
                  </div>
                </>
              ) : null}
            </div>

            <DialogFooter>
              {job.status === "scheduled" ? (
                <Button onClick={onComplete} disabled={submitting}>
                  <CheckCircle2 />
                  {submitting ? "Marking…" : "Mark complete"}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: "scheduled" | "completed" }) {
  if (status === "completed") {
    return (
      <Badge variant="secondary" className="uppercase tracking-widest">
        Completed
      </Badge>
    );
  }
  return <Badge className="uppercase tracking-widest">Scheduled</Badge>;
}
