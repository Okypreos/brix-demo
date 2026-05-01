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

/**
 * Build the half-hour start-time options between `startHour` and
 * `endHour` (24-hour, inclusive of `startHour`, exclusive of `endHour`).
 * 06:00 -> 20:00 default gives 28 sensible business-hours options
 * without overwhelming the dropdown.
 */
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

/** "08:30" -> "8:30am". Display-only formatter for the dropdown. */
function formatTimeOption(time: string) {
  const [hh, mm] = time.split(":");
  const hour = Number.parseInt(hh, 10);
  const period = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${mm}${period}`;
}

const DURATION_OPTIONS = [0.5, 1, 1.5, 2, 3, 4, 6, 8] as const;

function defaultDuration(estimatedHours: number): number {
  // Snap up to the nearest dropdown option so the seeded default
  // matches a real choice; if estimatedHours is e.g. 5h we round up
  // to 6 rather than displaying a non-selectable 5.
  const fromList = DURATION_OPTIONS.find((d) => d >= estimatedHours);
  return fromList ?? DURATION_OPTIONS[DURATION_OPTIONS.length - 1];
}

const TIME_OPTIONS = buildTimeOptions();

/**
 * Picks the next available `(date, "HH:mm")` pair from `TIME_OPTIONS`.
 *
 * - If today still has a slot strictly later than `now + bufferMs`,
 *   return today + that slot.
 * - Otherwise (e.g. it's already 8pm), roll the date forward to
 *   tomorrow and default to the first slot of the day (06:00).
 *
 * The buffer is intentionally small (60s); the real safety net is the
 * 5-minute grace inside `validateWindow` server-side. The buffer just
 * keeps the *displayed* default visibly in the future so the user
 * doesn't open the dialog and immediately see a slot that's already
 * past.
 */
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

  // No slot left today — roll forward to tomorrow at the first slot
  // (06:00 by default; tracks `buildTimeOptions`'s start hour).
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: tomorrow, startTime: TIME_OPTIONS[0] };
}

/**
 * Schedule a Quote: pick a technician, a date, a start time, and a
 * duration. On submit, calls `jobs.assign` which atomically inserts
 * the job, flips the quote to scheduled, and notifies the technician
 * (with backend-enforced no-overlap via Convex's serializable OCC).
 *
 * Conflict UX: when the server throws OVERLAP we extract
 * `conflictStart` / `conflictEnd` from the error payload and surface a
 * targeted toast like "Conflict: Mon Apr 30, 2:00pm – 4:00pm". This
 * gives the user the exact window to dodge without a second round-trip.
 */
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

  // Default to the next available business-hours slot so the form
  // lands in a usable state without tripping the server's "no past
  // start" guard. If today is exhausted (e.g. opened at 9pm), this
  // rolls forward to tomorrow at 06:00. See `nextAvailableSlot`.
  // We compute it once per dialog open per quote — `useMemo` keys on
  // `quote.estimatedHours` keep the user's in-progress edits stable
  // across re-renders.
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
        technicianId: values.technicianId as Id<"technicians">,
        start,
        end,
      });
      toast.success("Job scheduled", {
        description: `${quote.title} · ${formatJobWindow(start, end)}`,
      });
      onSuccess?.();
    } catch (err) {
      if (err instanceof ConvexError) {
        const data = err.data as
          | {
              code?: string;
              message?: string;
              conflictStart?: number;
              conflictEnd?: number;
            }
          | string
          | undefined;
        if (typeof data === "object" && data?.code === "OVERLAP") {
          const detail =
            typeof data.conflictStart === "number" &&
            typeof data.conflictEnd === "number"
              ? formatJobWindow(data.conflictStart, data.conflictEnd)
              : undefined;
          toast.error("Time slot taken", {
            description: detail
              ? `${data.message ?? "Conflict"} · ${detail}`
              : (data.message ?? "Pick another window."),
          });
          return;
        }
        const message =
          typeof data === "string"
            ? data
            : (data?.message ?? "Could not schedule job.");
        toast.error("Could not schedule job", { description: message });
        return;
      }
      console.error(err);
      toast.error("Something went wrong", {
        description: "Please try again in a moment.",
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
                    {technicians.map((t: Doc<"technicians">) => (
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
                      // Disable past days to keep the picker honest;
                      // the server still re-checks. Comparing local
                      // midnight handles the "today is still pickable"
                      // case correctly.
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
