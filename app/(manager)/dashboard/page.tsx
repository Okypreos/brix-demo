import Link from "next/link";
import { ArrowRight, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardKpis } from "@/components/manager/dashboard-kpis";

// Manager dashboard. KPI strip + shortcut card. KPI strip is a client
// component so the numbers tick reactively when a quote is created.
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
      </div>
    </div>
  );
}
