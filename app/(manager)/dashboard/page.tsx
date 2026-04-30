import Link from "next/link";
import { ArrowRight, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardKpis } from "@/components/manager/dashboard-kpis";

/**
 * Manager dashboard.
 *
 * For now this is a quick-glance landing page with KPIs and shortcut
 * cards. Once jobs and notifications exist (Steps 6-7) we'll expand it
 * with "Jobs today", "Recent notifications", and "Active technicians".
 *
 * The KPI strip is a Client Component so it's reactive — the moment a
 * quote is created from the New Quote sheet, the count updates without
 * a refresh.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          A quick view of work in flight. More widgets land here as we add jobs
          and notifications.
        </p>
      </div>

      <DashboardKpis />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <ClipboardList className="size-4" />
            </div>
            <CardTitle className="mt-2">Quotes</CardTitle>
            <CardDescription>
              Browse incoming work, create new quotes, and assign them to
              technicians.
            </CardDescription>
          </CardHeader>
          <CardFooter className="gap-2">
            <Button asChild>
              <Link href="/quotes">
                Open quotes
                <ArrowRight className="ml-1" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/quotes?new=1">
                <Plus className="mr-1" />
                New quote
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="mt-0">Coming soon</CardTitle>
            <CardDescription>
              Job assignment, technician schedules, and live notifications go
              here once their backend is wired up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-1.5 text-sm text-muted-foreground">
              <li>· Assign quotes to technicians (no overlap)</li>
              <li>· Live calendar of every technician&apos;s week</li>
              <li>· Notifications when jobs are completed</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
