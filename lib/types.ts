import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

// Domain types inferred from the Convex API so the client stays in
// sync with the server schema.

export type Quote = FunctionReturnType<typeof api.quotes.list>[number];

export type QuoteStatus = Quote["status"];
