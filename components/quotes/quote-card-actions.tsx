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

// Card action row. Edit is hidden on completed; delete is hidden on
// anything but unscheduled (matches server rules — keeps users from
// hitting a confusing FORBIDDEN).
//
// Dialogs are siblings of the dropdown (not nested) so the dropdown
// closing doesn't unmount the dialog mid-interaction.
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
          // Reserve button height so cards line up across statuses.
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
