import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

// User row returned by `api.users.current`. Inferred from the API so
// the server validators stay the single source of truth — add a
// column there and every consumer picks it up.
export type User = NonNullable<FunctionReturnType<typeof api.users.current>>;
