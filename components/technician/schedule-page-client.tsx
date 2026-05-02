"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { JobDetailDialog, type JobDetail } from "./job-detail-dialog";

// react-big-calendar is the heaviest module in the project.
// next/dynamic + ssr:false keeps it out of the initial bundle for
// every other page. The skeleton matches the hydrated height so
// layout doesn't shift on load.
//
// ssr:false is the right call — rbc's imperative DOM measurements
// assume a browser. https://nextjs.org/docs/app/guides/lazy-loading
const ScheduleCalendar = dynamic(
  () => import("./schedule-calendar").then((m) => m.ScheduleCalendar),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[640px] w-full rounded-lg" />,
  },
);

// Owns "selected job" state and bridges the calendar onClick to the
// detail dialog. Re-runs the same listWithQuotes query as the
// calendar — Convex dedupes identical subscriptions, so it's not a
// duplicate read, and the dialog sees fresh data after Mark Complete.
//
// `technicianId` + `readOnly` let the manager-side
// /technicians/[id] page reuse this same wrapper.
export function SchedulePageClient({
  technicianId,
  readOnly = false,
}: {
  technicianId?: Id<"users">;
  readOnly?: boolean;
} = {}) {
  const [selectedJobId, setSelectedJobId] = useState<Id<"jobs"> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // No range here so we hit the same cache as the calendar's current
  // window. Slight over-fetch buys a much simpler contract.
  const allJobs = useQuery(api.jobs.listWithQuotes, { technicianId });

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
    // Keep the id while the dialog animates closed so contents don't
    // blank out mid-transition. Then null it out so the next open
    // doesn't flash stale data.
    if (!next) {
      setTimeout(() => setSelectedJobId(null), 200);
    }
  }

  return (
    <>
      <ScheduleCalendar
        onSelectJob={handleSelect}
        technicianId={technicianId}
      />
      <JobDetailDialog
        job={selectedJob}
        open={dialogOpen}
        onOpenChange={handleOpenChange}
        readOnly={readOnly}
      />
    </>
  );
}
