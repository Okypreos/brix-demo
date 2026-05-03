"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuoteForm } from "@/components/forms/quote-form";
import type { Quote } from "@/lib/types";

// Modal wrapper around <QuoteForm> in edit mode. The form pre-fills
// from `quote` and routes submits through `quotes.update`. When the
// quote is already scheduled, the technician gets a notification on
// save — surface that here so the manager isn't surprised.
export function EditQuoteDialog({
  quote,
  open,
  onOpenChange,
}: {
  quote: Quote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isScheduled = quote.status === "scheduled";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit quote</DialogTitle>
          <DialogDescription>
            Update the customer details or description for this quote.
            {isScheduled && " The assigned technician will be notified."}
          </DialogDescription>
        </DialogHeader>
        <QuoteForm
          mode={{ kind: "edit", quote }}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
