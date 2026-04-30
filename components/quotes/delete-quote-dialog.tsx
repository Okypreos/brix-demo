"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/convex/_generated/api";
import type { Quote } from "@/lib/types";

/**
 * Confirms quote deletion. The server-side `quotes.remove` mutation
 * refuses if the quote has already been scheduled or completed, but we
 * also gate the menu item that opens this dialog so the user shouldn't
 * normally see a FORBIDDEN error here.
 *
 * AlertDialog (vs the regular Dialog) gives us the right semantics for
 * destructive confirmations — focus pinned to the destructive action,
 * no `onOpenChange` close-on-overlay-click.
 */
export function DeleteQuoteDialog({
  quote,
  open,
  onOpenChange,
}: {
  quote: Quote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const removeQuote = useMutation(api.quotes.remove);

  async function handleConfirm() {
    setIsDeleting(true);
    try {
      const result = await removeQuote({ id: quote._id });
      toast.success("Quote deleted", {
        description: `"${result.title}" was removed.`,
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string } | string | undefined;
        const message =
          typeof data === "string"
            ? data
            : (data?.message ?? "Could not delete the quote.");
        toast.error("Could not delete quote", { description: message });
      } else {
        console.error(err);
        toast.error("Something went wrong", {
          description: "Please try again in a moment.",
        });
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{quote.title}&rdquo; will be permanently removed. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Prevent radix from auto-closing before the mutation
              // finishes; we close manually in handleConfirm so the
              // dialog stays open if the server rejects the delete.
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
