"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuoteForm } from "@/components/forms/quote-form";
import { QuotesGrid } from "./quotes-grid";

const TABS = [
  { value: "all", label: "All", emptyMessage: "No quotes yet — create your first one." },
  { value: "unscheduled", label: "Unscheduled", emptyMessage: "Nothing waiting to be scheduled." },
  { value: "scheduled", label: "Scheduled", emptyMessage: "No scheduled jobs right now." },
  { value: "completed", label: "Completed", emptyMessage: "No completed jobs yet." },
] as const;

type TabValue = (typeof TABS)[number]["value"];

// Quotes page interactive shell. Tabs drive the `status` arg on
// `quotes.list`. "New quote" opens a slide-over; ?new=1 deep-links to
// the same sheet from the dashboard shortcut.
//
// sheetOpen = localOpen || wantsNew. Deriving (instead of syncing in
// an effect) avoids the cascading-render anti-pattern and keeps the
// URL as source of truth for deep links.
export function QuotesPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wantsNew = searchParams.get("new") === "1";

  const [tab, setTab] = useState<TabValue>("all");
  const [localOpen, setLocalOpen] = useState(false);

  const sheetOpen = localOpen || wantsNew;

  function handleSheetOpenChange(open: boolean) {
    if (open) {
      setLocalOpen(true);
      return;
    }
    // Closing has to clear both truths — drop the local flag and
    // strip ?new=1 if the URL was what held the sheet open.
    setLocalOpen(false);
    if (wantsNew) {
      router.replace("/quotes", { scroll: false });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Quotes
          </h1>
          <p className="text-sm text-muted-foreground">
            Incoming work to schedule onto a technician&apos;s calendar.
          </p>
        </div>
        <Button onClick={() => handleSheetOpenChange(true)}>
          <Plus />
          New quote
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList variant="line">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-6">
            <QuotesGrid
              status={t.value === "all" ? undefined : t.value}
              emptyMessage={t.emptyMessage}
            />
          </TabsContent>
        ))}
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New quote</SheetTitle>
            <SheetDescription>
              Capture an incoming job. You can assign it to a technician once
              it&apos;s created.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <QuoteForm
              onSuccess={() => handleSheetOpenChange(false)}
              onCancel={() => handleSheetOpenChange(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
