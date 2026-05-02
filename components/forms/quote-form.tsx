"use client";

import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Quote } from "@/lib/types";
import { quoteFormSchema, type QuoteFormValues } from "@/lib/validators/quote";

// Reusable create-or-edit quote form. RHF + zod via the resolver;
// shadcn <Field> renders inline errors. The `mode` prop picks
// between `quotes.create` and `quotes.update`. ConvexErrors surface
// as Sonner toasts.
type QuoteFormMode =
  | { kind: "create" }
  | { kind: "edit"; quote: Quote };

export function QuoteForm({
  mode = { kind: "create" },
  onSuccess,
  onCancel,
}: {
  mode?: QuoteFormMode;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const formId = useId();

  const createQuote = useMutation(api.quotes.create);
  const updateQuote = useMutation(api.quotes.update);

  const isEdit = mode.kind === "edit";

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: isEdit
      ? {
          title: mode.quote.title,
          description: mode.quote.description,
          customerName: mode.quote.customerName,
          customerAddress: mode.quote.customerAddress ?? "",
          estimatedHours: mode.quote.estimatedHours,
        }
      : {
          title: "",
          description: "",
          customerName: "",
          customerAddress: "",
          estimatedHours: 2,
        },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  async function onSubmit(values: QuoteFormValues) {
    // Empty string -> undefined so we don't store blanks server-side
    // (the column is optional).
    const customerAddress =
      values.customerAddress && values.customerAddress.length > 0
        ? values.customerAddress
        : undefined;
    try {
      if (isEdit) {
        await updateQuote({
          id: mode.quote._id,
          title: values.title,
          description: values.description,
          customerName: values.customerName,
          customerAddress,
          estimatedHours: values.estimatedHours,
        });
        toast.success("Quote updated", {
          description: `Saved changes to "${values.title}".`,
        });
      } else {
        await createQuote({
          title: values.title,
          description: values.description,
          customerName: values.customerName,
          customerAddress,
          estimatedHours: values.estimatedHours,
        });
        toast.success("Quote created", {
          description: `"${values.title}" is now in the unscheduled list.`,
        });
      }
      onSuccess?.();
    } catch (err) {
      if (!(err instanceof ConvexError)) {
        console.error(err);
        toast.error("Something went wrong", {
          description: "Please try again in a moment.",
        });
        return;
      }

      const data = err.data as { message?: string };
      toast.error(isEdit ? "Could not save quote" : "Could not create quote", {
        description:
          data.message ??
          (isEdit ? "Could not save changes." : "Could not create the quote."),
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
          name="title"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-title`}>Title</FieldLabel>
              <Input
                {...field}
                id={`${formId}-title`}
                placeholder="Replace HVAC filter at Riverside office"
                aria-invalid={fieldState.invalid}
                autoComplete="off"
              />
              <FieldDescription>
                A short summary the technician will see at a glance.
              </FieldDescription>
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          name="customerName"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customerName`}>
                Customer name
              </FieldLabel>
              <Input
                {...field}
                id={`${formId}-customerName`}
                placeholder="Acme Holdings"
                aria-invalid={fieldState.invalid}
                autoComplete="off"
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          name="customerAddress"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-customerAddress`}>
                Address <span className="text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id={`${formId}-customerAddress`}
                placeholder="42 Riverside Drive, Sydney NSW"
                aria-invalid={fieldState.invalid}
                autoComplete="off"
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          name="estimatedHours"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-estimatedHours`}>
                Estimated hours
              </FieldLabel>
              <Input
                id={`${formId}-estimatedHours`}
                type="number"
                inputMode="decimal"
                min={0.5}
                max={24}
                step={0.5}
                value={Number.isFinite(field.value) ? field.value : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  // Empty -> NaN so zod's "required" fires instead of
                  // silently coercing to 0.
                  field.onChange(raw === "" ? Number.NaN : Number(raw));
                }}
                onBlur={field.onBlur}
                ref={field.ref}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                Half-hour increments. The default 2-hour window can be
                overridden during scheduling.
              </FieldDescription>
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          name="description"
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-description`}>
                Description
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-description`}
                placeholder="Anything the technician needs to know — access codes, parts to bring, etc."
                rows={5}
                aria-invalid={fieldState.invalid}
              />
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
          {isEdit ? "Save changes" : "Create quote"}
        </Button>
      </div>
    </form>
  );
}
