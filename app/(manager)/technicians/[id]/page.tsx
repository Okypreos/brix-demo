import type { Id } from "@/convex/_generated/dataModel";
import { TechnicianDetailView } from "@/components/manager/technician-detail-view";

// Manager-side read-only schedule for one technician.
//
// The Id<"users"> cast is compile-time only — the v.id() validator on
// getTechnician handles runtime safety. Invalid ids (or manager ids)
// land on a friendly "not found" card inside the shell.
//
// Next.js 16 dynamic params are async, hence the Promise<…> typing.
export default async function TechnicianDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TechnicianDetailView technicianId={id as Id<"users">} />;
}
