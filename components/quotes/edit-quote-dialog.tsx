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
// from `quote` and routes submits through `quotes.update`.
export function EditQuoteDialog({
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
          <DialogTitle>Edit quote</DialogTitle>
          <DialogDescription>
            Update the customer details, estimate, or description for this
            quote.
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
