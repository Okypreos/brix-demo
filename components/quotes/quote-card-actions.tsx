"use client";

import { useState } from "react";
import { CalendarClock, CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssignQuoteDialog } from "./assign-quote-dialog";
import { EditQuoteDialog } from "./edit-quote-dialog";
import { DeleteQuoteDialog } from "./delete-quote-dialog";
import { RescheduleQuoteDialog } from "./reschedule-quote-dialog";
import type { Quote } from "@/lib/types";

// Card action row. One primary action per status (assign / reschedule),
// with Edit always visible (disabled when completed) and Delete only on
// unscheduled — matches the server rules so users can't hit a confusing
// FORBIDDEN by clicking something they shouldn't see.
//
// Buttons-in-row instead of a kebab so the available actions are
// discoverable at a glance — better for demoing the flow.
//
// Dialogs render alongside the buttons (not nested) so opening one
// keeps the trigger mounted across interactions.
export function QuoteCardActions({ quote }: { quote: Quote }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const isUnscheduled = quote.status === "unscheduled";
  const isScheduled = quote.status === "scheduled";
  const isCompleted = quote.status === "completed";

  return (
    <>
      <div className="flex w-full flex-wrap items-center gap-2">
        {isUnscheduled && (
          <Button size="sm" onClick={() => setAssignOpen(true)}>
            <CalendarPlus />
            Assign technician
          </Button>
        )}
        {isScheduled && (
          <Button size="sm" onClick={() => setRescheduleOpen(true)}>
            <CalendarClock />
            Reschedule
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditOpen(true)}
          disabled={isCompleted}
        >
          <Pencil />
          Edit
        </Button>
        {isUnscheduled && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteOpen(true)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
            Delete
          </Button>
        )}
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
      <RescheduleQuoteDialog
        quote={quote}
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
      />
    </>
  );
}
