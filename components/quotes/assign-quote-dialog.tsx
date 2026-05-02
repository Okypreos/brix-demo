"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssignJobForm } from "@/components/forms/assign-job-form";
import type { Quote } from "@/lib/types";

// Modal wrapper for the assign-job form. Controlled open state so the
// trigger can live in its own component.
export function AssignQuoteDialog({
  quote,
  open,
  onOpenChange,
}: {
  quote: Quote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule {quote.title}</DialogTitle>
          <DialogDescription>
            Pick a technician and a time window. We&apos;ll prevent any
            overlap with their existing jobs.
          </DialogDescription>
        </DialogHeader>
        <AssignJobForm
          quote={quote}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
