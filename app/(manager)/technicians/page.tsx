import { TechniciansGrid } from "@/components/manager/technicians-grid";

// Manager technicians index. Each card links to /technicians/[id].
export default function TechniciansPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Technicians
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse the team and open any technician&apos;s week to see what
          they&apos;re working on.
        </p>
      </div>
      <TechniciansGrid />
    </div>
  );
}
