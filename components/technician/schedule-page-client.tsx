"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { JobDetailDialog, type JobDetail } from "./job-detail-dialog";

/**
 * `react-big-calendar` (plus its localizer chain and ~18KB of CSS) is
 * the single heaviest module in this project. Statically importing it
 * here would pull the entire library into the initial dev module
 * graph, making cold `npm run dev` and the first compile of unrelated
 * pages much slower (Turbopack + Tailwind v4 PostCSS have to digest
 * the full vendor stylesheet up front).
 *
 * `next/dynamic` with `ssr: false` defers compilation and download
 * until a user actually visits the schedule page. Other pages
 * (manager dashboard, quotes) never pay for the calendar bundle, and
 * cold dev startup is dramatically lighter. The skeleton fallback
 * matches the calendar's hydrated height so layout doesn't shift
 * once the chunk loads.
 *
 * `ssr: false` is correct here because react-big-calendar's
 * imperative DOM measurements assume a real browser; it doesn't
 * render anything useful on the server anyway.
 *
 * See https://nextjs.org/docs/app/guides/lazy-loading
 */
const ScheduleCalendar = dynamic(
  () => import("./schedule-calendar").then((m) => m.ScheduleCalendar),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[640px] w-full rounded-lg" />,
  },
);

/**
 * Client wrapper that owns the "selected job" state and bridges the
 * calendar event onClick to the detail dialog.
 *
 * We re-run the same `listWithQuotes` query the calendar uses — Convex
 * dedupes identical subscriptions, so this isn't a duplicate read.
 * The benefit is the dialog always sees the latest hydrated row for
 * the selected job (including a status flip after Mark Complete).
 */
export function SchedulePageClient() {
  const [selectedJobId, setSelectedJobId] = useState<Id<"jobs"> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // We pass no range here so the lookup hits the same cache as the
  // calendar's current window. A second-precision dedupe would
  // require sharing the date state; for the small extra cost of an
  // unbounded fetch we get a much simpler component contract.
  const allJobs = useQuery(api.jobs.listWithQuotes, {});

  const jobsById = useMemo(() => {
    const map = new Map<Id<"jobs">, JobDetail>();
    if (!allJobs) return map;
    for (const j of allJobs) {
      map.set(j._id, {
        jobId: j._id,
        start: j.start,
        end: j.end,
        status: j.status,
        completedAt: j.completedAt,
        quote: j.quote,
      });
    }
    return map;
  }, [allJobs]);

  const selectedJob =
    selectedJobId !== null ? jobsById.get(selectedJobId) ?? null : null;

  function handleSelect(jobId: Id<"jobs">) {
    setSelectedJobId(jobId);
    setDialogOpen(true);
  }

  function handleOpenChange(next: boolean) {
    setDialogOpen(next);
    // Hold onto the id while the dialog animates closed so the
    // contents don't blank out mid-transition. When fully closed,
    // null it out so the next open doesn't briefly flash the old
    // job's data.
    if (!next) {
      setTimeout(() => setSelectedJobId(null), 200);
    }
  }

  return (
    <>
      <ScheduleCalendar onSelectJob={handleSelect} />
      <JobDetailDialog
        job={selectedJob}
        open={dialogOpen}
        onOpenChange={handleOpenChange}
      />
    </>
  );
}
