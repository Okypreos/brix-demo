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
// Order matters: library defaults first (plain JS import, bypasses
// PostCSS/Tailwind), our overrides second so they win the cascade.
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./calendar-styles.css";

// Reactive schedule calendar.
//
// View state is local; each change recomputes a 28-day query window
// centered on the visible date so prev/next within the cached range
// doesn't refetch. The Convex query is reactive — assignments and
// reschedules elsewhere appear here without a reload. Slot clicks
// are ignored (techs can't self-assign).
//
// `technicianId` omitted => backend picks the calling user (own
// schedule). Provided => manager view of that tech.

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

// Half-window around the visible date.
const QUERY_WINDOW_DAYS = 14;

export function ScheduleCalendar({
  onSelectJob,
  technicianId,
}: {
  onSelectJob: (jobId: Id<"jobs">) => void;
  // Set => that tech's schedule (manager view). Omitted => self.
  technicianId?: Id<"users">;
}) {
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState<Date>(() => new Date());

  // Over-fetch ±14 days so navigating within that span hits Convex's
  // reactive cache instead of opening a fresh subscription.
  const { rangeStart, rangeEnd } = useMemo(() => {
    return {
      rangeStart: subDays(date, QUERY_WINDOW_DAYS).getTime(),
      rangeEnd: addDays(date, QUERY_WINDOW_DAYS).getTime(),
    };
  }, [date]);

  const jobs = useQuery(api.jobs.listWithQuotes, {
    rangeStart,
    rangeEnd,
    technicianId,
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
        // 7am–8pm so a working week fits without scrolling.
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
        // Techs can't self-assign.
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

// Compact event renderer for all views — week/day are narrow, agenda
// is wider but library handles its own time column either way.
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
