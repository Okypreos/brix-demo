"use client";

import { ManagerShell } from "@/components/manager/manager-shell";
import { RoleGate } from "@/components/layout/role-gate";

// Manager workspace layout. "use client" because passing a function
// as `children` to <RoleGate> only works in client components.
// Nested pages can still be server components — they flow through
// `children` as already-rendered React.
export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGate role="manager">
      {(user) => <ManagerShell user={user}>{children}</ManagerShell>}
    </RoleGate>
  );
}
