import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

/**
 * The discriminated-union return shape of `api.users.current`. Pulling
 * the type from the API itself means the validators in `convex/users.ts`
 * are the single source of truth — the moment we add a field to the
 * managers/technicians validator, every consumer here gets the update
 * for free.
 */
export type CurrentUser = NonNullable<
  FunctionReturnType<typeof api.users.current>
>;

export type CurrentManager = Extract<CurrentUser, { kind: "manager" }>;
export type CurrentTechnician = Extract<CurrentUser, { kind: "technician" }>;
