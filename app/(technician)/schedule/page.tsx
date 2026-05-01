import { SchedulePageClient } from "@/components/technician/schedule-page-client";

export default function SchedulePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          My schedule
        </h1>
        <p className="text-sm text-muted-foreground">
          Click an event to see the job details and mark it complete.
        </p>
      </div>
      <SchedulePageClient />
    </div>
  );
}
