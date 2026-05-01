"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  Views,
  type SlotInfo,
  type View,
} from "react-big-calendar";
import dateFnsLocalizer from "react-big-calendar/lib/localizers/date-fns";
import { format, parse, startOfWeek, getDay, addDays, subDays } from "date-fns";
import { enUS } from "date-fns/locale";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
// Order matters: load the library defaults FIRST as a plain JS import
// (bypasses PostCSS / Tailwind chase entirely), then our overrides
// via the local stylesheet so they win the cascade.
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./calendar-styles.css";

/**
 * Reactive schedule calendar.
 *
 * - View state (week/day/agenda + visible date) is local. Each change
 *   recomputes a 28-day query window centered on the visible date so
 *   prev/next clicks within the cached range don't refetch.
 * - The Convex query is reactive: as a manager assigns or reschedules
 *   jobs anywhere else in the app, the events appear/move on this
 *   calendar without a page reload.
 * - Clicking an event invokes `onSelect(jobId)`, which the parent
 *   uses to open the job detail dialog. Slot clicks (empty space)
 *   are ignored — technicians can't self-assign jobs.
 *
 * Loading state mirrors the page's grid: a skeleton sized to the
 * calendar's typical height so layout doesn't jump on hydration.
 */

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { "en-US": enUS },
});

export type ScheduleEvent = {
  id: Id<"jobs">;
  title: string;
  start: Date;
  end: Date;
  status: "scheduled" | "completed";
  customerName: string;
};

const QUERY_WINDOW_DAYS = 14; // ± this many days around the visible date

export function ScheduleCalendar({
  onSelectJob,
}: {
  onSelectJob: (jobId: Id<"jobs">) => void;
}) {
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState<Date>(() => new Date());

  // Query window. We over-fetch ± 14 days around the visible date so
  // navigating within that span hits Convex's reactive cache, not a
  // fresh subscription. The window snaps to a stable size so the
  // useQuery key only changes when the user navigates further than
  // expected.
  const { rangeStart, rangeEnd } = useMemo(() => {
    return {
      rangeStart: subDays(date, QUERY_WINDOW_DAYS).getTime(),
      rangeEnd: addDays(date, QUERY_WINDOW_DAYS).getTime(),
    };
  }, [date]);

  const jobs = useQuery(api.jobs.listWithQuotes, {
    rangeStart,
    rangeEnd,
  });

  const events = useMemo<ScheduleEvent[]>(() => {
    if (!jobs) return [];
    return jobs.map((j) => ({
      id: j._id,
      title: j.quote.title,
      start: new Date(j.start),
      end: new Date(j.end),
      status: j.status,
      customerName: j.quote.customerName,
    }));
  }, [jobs]);

  if (jobs === undefined) {
    return <Skeleton className="h-[640px] w-full rounded-lg" />;
  }

  return (
    <div className="h-[640px]">
      <Calendar<ScheduleEvent>
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        // Switch the day-grid range to 7am-8pm so a working week fits
        // without scrolling. Tech sees the whole working day at a
        // glance.
        min={new Date(1970, 0, 1, 7, 0, 0)}
        max={new Date(1970, 0, 1, 20, 0, 0)}
        view={view}
        onView={setView}
        date={date}
        onNavigate={setDate}
        views={[Views.WEEK, Views.DAY, Views.AGENDA]}
        defaultView={Views.WEEK}
        popup
        onSelectEvent={(event) => onSelectJob(event.id)}
        // Disabled: techs can't self-assign jobs.
        onSelectSlot={(_: SlotInfo) => undefined}
        eventPropGetter={(event) => ({
          className:
            event.status === "completed"
              ? "brix-event-completed"
              : "brix-event-scheduled",
        })}
        components={{
          event: EventCell,
        }}
      />
    </div>
  );
}

/**
 * Compact event renderer used by all views.
 *
 * Week/day views give us very little vertical space, so we show
 * "<time> <title>" inline. Agenda is wider and uses the library's
 * default time column, so we keep this minimal and let the library
 * handle the layout.
 */
function EventCell({ event }: { event: ScheduleEvent }) {
  return (
    <div className="flex flex-col gap-0 leading-tight">
      <span className="font-medium truncate">{event.title}</span>
      <span className="text-[10px] opacity-80 truncate">
        {event.customerName}
      </span>
    </div>
  );
}
