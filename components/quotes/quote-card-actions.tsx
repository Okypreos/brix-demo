"use client";

import { useState } from "react";
import { CalendarPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssignQuoteDialog } from "./assign-quote-dialog";
import { EditQuoteDialog } from "./edit-quote-dialog";
import { DeleteQuoteDialog } from "./delete-quote-dialog";
import type { Quote } from "@/lib/types";

/**
 * Quote-card action row: a primary "Assign technician" button when the
 * quote is unscheduled, plus a kebab dropdown for Edit and Delete.
 *
 * Edit is allowed for unscheduled and scheduled quotes (the server
 * rejects edits to completed quotes). Delete is allowed only for
 * unscheduled quotes; the menu item is hidden otherwise so users
 * don't run into a confusing FORBIDDEN error.
 *
 * The three dialogs are kept as siblings (not nested under the
 * dropdown) so closing the dropdown menu doesn't unmount the dialog
 * mid-interaction. The dropdown calls `setX` to open a dialog, then
 * closes itself; the dialog stays open until dismissed.
 */
export function QuoteCardActions({ quote }: { quote: Quote }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isUnscheduled = quote.status === "unscheduled";
  const isCompleted = quote.status === "completed";

  return (
    <>
      <div className="flex w-full items-center justify-between gap-2">
        {isUnscheduled ? (
          <Button size="sm" onClick={() => setAssignOpen(true)}>
            <CalendarPlus />
            Assign technician
          </Button>
        ) : (
          // Reserve the same vertical space as the button so cards
          // line up neatly across statuses.
          <div className="h-9" aria-hidden />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Quote actions"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => setEditOpen(true)}
              disabled={isCompleted}
            >
              <Pencil />
              Edit
            </DropdownMenuItem>
            {isUnscheduled && (
              <DropdownMenuItem
                onSelect={() => setDeleteOpen(true)}
                variant="destructive"
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AssignQuoteDialog
        quote={quote}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />
      <EditQuoteDialog
        quote={quote}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteQuoteDialog
        quote={quote}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
