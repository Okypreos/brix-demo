"use client";

import { useId, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  combineDateAndTime,
  formatJobWindow,
} from "@/lib/format/datetime";
import {
  DURATION_OPTIONS,
  TIME_OPTIONS,
  formatDurationOption,
  formatTimeOption,
  splitEpochMsForForm,
} from "@/lib/scheduling";
import type { Quote } from "@/lib/types";
import {
  rescheduleJobFormSchema,
  type RescheduleJobFormValues,
} from "@/lib/validators/reschedule-job";

// Move an existing job to a new window. Tech is fixed (you reassign by
// deleting + re-assigning, intentionally a different flow). Submits to
// `jobs.reschedule` which re-runs the OCC overlap guard, so two
// managers shifting the same tech at the same instant cannot collide.
//
// Same OVERLAP toast UX as assign-job-form.
export function RescheduleJobForm({
  quote,
  job,
  onSuccess,
  onCancel,
}: {
  quote: Quote;
  job: Doc<"jobs">;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const formId = useId();
  const reschedule = useMutation(api.jobs.reschedule);

  // Pre-fill from the current job so the manager sees where it is
  // before nudging it. Duration recovered from end-start.
  const defaults = useMemo<RescheduleJobFormValues>(() => {
    const { date, startTime } = splitEpochMsForForm(job.start);
    const durationHours = (job.end - job.start) / (60 * 60 * 1000);
    return { date, startTime, durationHours };
  }, [job.start, job.end]);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RescheduleJobFormValues>({
    resolver: zodResolver(rescheduleJobFormSchema),
    defaultValues: defaults,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: RescheduleJobFormValues) {
    try {
      const start = combineDateAndTime(values.date, values.startTime);
      const end = start + values.durationHours * 60 * 60 * 1000;
      await reschedule({ jobId: job._id, start, end });
      toast.success("Job rescheduled", {
        description: `${quote.title} · ${formatJobWindow(start, end)}`,
      });
      onSuccess?.();
    } catch (err) {
      if (!(err instanceof ConvexError)) {
        console.error(err);
        toast.error("Something went wrong", {
          description: "Please try again in a moment.",
        });
        return;
      }

      const data = err.data as {
        code?: string;
        message?: string;
        conflictStart?: number;
        conflictEnd?: number;
      };

      if (data.code === "OVERLAP" && data.conflictStart && data.conflictEnd) {
        toast.error("Time slot taken", {
          description: `${data.message} · ${formatJobWindow(data.conflictStart, data.conflictEnd)}`,
        });
        return;
      }

      toast.error("Could not reschedule job", {
        description: data.message ?? "Pick another window.",
      });
    }
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
    >
      <FieldGroup>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="date"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-date`}>Date</FieldLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id={`${formId}-date`}
                      type="button"
                      variant="outline"
                      className="justify-start font-normal"
                      aria-invalid={fieldState.invalid}
                    >
                      <CalendarIcon className="mr-1" />
                      {field.value
                        ? format(field.value, "EEE MMM d, yyyy")
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(d) => d && field.onChange(d)}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="startTime"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-startTime`}>
                  Start time
                </FieldLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id={`${formId}-startTime`}
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Pick a time" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {formatTimeOption(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </div>

        <Controller
          name="durationHours"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-duration`}>Duration</FieldLabel>
              <Select
                value={String(field.value)}
                onValueChange={(v) => field.onChange(Number(v))}
              >
                <SelectTrigger
                  id={`${formId}-duration`}
                  aria-invalid={fieldState.invalid}
                >
                  <SelectValue placeholder="Pick a duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {formatDurationOption(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />
      </FieldGroup>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          Reschedule job
        </Button>
      </div>
    </form>
  );
}
