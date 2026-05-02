"use client";

import { TechnicianShell } from "@/components/technician/technician-shell";
import { RoleGate } from "@/components/layout/role-gate";

// Technician workspace layout. "use client" for the same reason as
// the manager layout — RoleGate uses a render-prop. All gating logic
// lives in <RoleGate>.
export default function TechnicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGate role="technician">
      {(user) => <TechnicianShell user={user}>{children}</TechnicianShell>}
    </RoleGate>
  );
}
