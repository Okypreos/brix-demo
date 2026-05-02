"use client";

import { useId, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Field,
  FieldDescription,
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
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  combineDateAndTime,
  formatJobWindow,
} from "@/lib/format/datetime";
import type { Quote } from "@/lib/types";
import {
  assignJobFormSchema,
  type AssignJobFormValues,
} from "@/lib/validators/assign-job";

// Half-hour options between startHour and endHour (inclusive of start,
// exclusive of end). 06:00 -> 20:00 gives 28 business-hours slots.
function buildTimeOptions(startHour = 6, endHour = 20): string[] {
  const options: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 30]) {
      options.push(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
      );
    }
  }
  return options;
}

// "08:30" -> "8:30am". Display-only.
function formatTimeOption(time: string) {
  const [hh, mm] = time.split(":");
  const hour = Number.parseInt(hh, 10);
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${mm}${period}`;
}

const DURATION_OPTIONS = [0.5, 1, 1.5, 2, 3, 4, 6, 8] as const;

// Snap up to the nearest dropdown option so the default matches a
// real choice (5h estimate -> 6h shown).
function defaultDuration(estimatedHours: number): number {
  const fromList = DURATION_OPTIONS.find((d) => d >= estimatedHours);
  return fromList ?? DURATION_OPTIONS[DURATION_OPTIONS.length - 1];
}

const TIME_OPTIONS = buildTimeOptions();

// Next (date, "HH:mm") slot strictly after `now + bufferMs`. If today
// is exhausted, rolls forward to tomorrow at 06:00.
//
// 60s buffer keeps the displayed default visibly in the future. The
// real "no past start" check is server-side in validateWindow.
function nextAvailableSlot(
  now: Date = new Date(),
  bufferMs = 60_000,
): { date: Date; startTime: string } {
  const threshold = now.getTime() + bufferMs;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  for (const option of TIME_OPTIONS) {
    const [hh, mm] = option.split(":");
    const candidate = new Date(today);
    candidate.setHours(Number.parseInt(hh, 10), Number.parseInt(mm, 10), 0, 0);
    if (candidate.getTime() > threshold) {
      return { date: today, startTime: option };
    }
  }

  // No slot left today — roll forward to tomorrow's first slot.
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: tomorrow, startTime: TIME_OPTIONS[0] };
}

// Schedule a quote: pick technician + date + start + duration. Submit
// calls `jobs.assign` (atomic + serializable OCC, no double-booking).
//
// On OVERLAP we pull conflictStart/conflictEnd from the error payload
// and toast the exact busy window so the user knows what to dodge.
export function AssignJobForm({
  quote,
  onSuccess,
  onCancel,
}: {
  quote: Quote;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const formId = useId();
  const technicians = useQuery(api.users.listTechnicians);
  const assign = useMutation(api.jobs.assign);

  // Default to the next business-hours slot so the form lands usable.
  // useMemo keyed on estimatedHours so user edits survive re-renders.
  const defaults = useMemo<AssignJobFormValues>(() => {
    const { date, startTime } = nextAvailableSlot();
    return {
      technicianId: "",
      date,
      startTime,
      durationHours: defaultDuration(quote.estimatedHours),
    };
  }, [quote.estimatedHours]);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<AssignJobFormValues>({
    resolver: zodResolver(assignJobFormSchema),
    defaultValues: defaults,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: AssignJobFormValues) {
    try {
      const start = combineDateAndTime(values.date, values.startTime);
      const end = start + values.durationHours * 60 * 60 * 1000;
      await assign({
        quoteId: quote._id,
        technicianId: values.technicianId as Id<"users">,
        start,
        end,
      });
      toast.success("Job scheduled", {
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

      toast.error("Could not schedule job", {
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
        <Controller
          name="technicianId"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-technician`}>
                Technician
              </FieldLabel>
              {technicians === undefined ? (
                <Skeleton className="h-10 w-full" />
              ) : technicians.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No technicians yet. Invite a teammate by sending them
                  the sign-up link — they&apos;ll be added automatically.
                </p>
              ) : (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id={`${formId}-technician`}
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue placeholder="Pick a technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians.map((t: Doc<"users">) => (
                      <SelectItem key={t._id} value={t._id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

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
                      // Disable past days; server still re-checks.
                      // Local midnight keeps "today" pickable.
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
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                >
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
              <FieldLabel htmlFor={`${formId}-duration`}>
                Duration
              </FieldLabel>
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
              <FieldDescription>
                Default seeded from this quote&apos;s estimated{" "}
                {formatDurationOption(quote.estimatedHours)}.
              </FieldDescription>
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
        <Button
          type="submit"
          disabled={isSubmitting || technicians?.length === 0}
        >
          {isSubmitting && <Loader2 className="animate-spin" />}
          Schedule job
        </Button>
      </div>
    </form>
  );
}

function formatDurationOption(hours: number) {
  if (hours < 1) return `${hours * 60} min`;
  if (hours === 1) return "1 hour";
  return `${hours} hours`;
}
