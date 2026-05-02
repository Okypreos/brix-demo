"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowRight, Mail, Users } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Reactive grid of technician cards. Each links to /technicians/[id]
// for that tech's read-only schedule.
export function TechniciansGrid() {
  const technicians = useQuery(api.users.listTechnicians);

  if (technicians === undefined) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  if (technicians.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
        <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Users className="size-5" />
        </div>
        <p className="text-sm text-muted-foreground">
          No technicians yet. As soon as someone signs up they&apos;ll
          appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {technicians.map((tech: Doc<"users">) => (
        <TechnicianCard key={tech._id} technician={tech} />
      ))}
    </div>
  );
}

function TechnicianCard({ technician }: { technician: Doc<"users"> }) {
  return (
    <Card size="sm" className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle className="text-base normal-case tracking-normal">
          {technician.name}
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="size-3.5" />
          <span className="truncate">{technician.email}</span>
        </div>
      </CardHeader>
      <CardContent />
      <CardFooter>
        <Button asChild size="sm" variant="outline">
          <Link href={`/technicians/${technician._id}`}>
            View schedule
            <ArrowRight className="ml-1" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
