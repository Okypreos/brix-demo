"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SchedulePageClient } from "@/components/technician/schedule-page-client";

// Manager-side read-only view of one technician's schedule.
//
// undefined  -> in-flight, spinner
// null       -> not found, inline card (keeps sidebar visible)
// otherwise  -> header + read-only schedule
//
// Authorization is server-side: getTechnician + jobs.listWithQuotes
// both call requireManager.
export function TechnicianDetailView({
  technicianId,
}: {
  technicianId: Id<"users">;
}) {
  const technician = useQuery(api.users.getTechnician, { id: technicianId });

  if (technician === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <div
          className="flex h-64 items-center justify-center"
          role="status"
          aria-live="polite"
          aria-label="Loading technician"
        >
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (technician === null) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Technician not found</CardTitle>
            <CardDescription>
              This technician may have been removed, or the link is invalid.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink />
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {technician.name}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="size-3.5" />
            <span>{technician.email}</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Read-only view of {technician.name}&apos;s upcoming work. Click an
          event to see the customer and job details.
        </p>
      </div>
      <SchedulePageClient technicianId={technician._id} readOnly />
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link href="/technicians">
        <ArrowLeft />
        All technicians
      </Link>
    </Button>
  );
}
