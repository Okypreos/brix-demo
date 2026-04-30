import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

/**
 * Public domain types pulled from the Convex API surface so the client
 * has a single source of truth and stays in sync with the schema.
 */

// `quotes.list` returns an array; we want the element type for components
// that render a single quote.
export type Quote = FunctionReturnType<typeof api.quotes.list>[number];

export type QuoteStatus = Quote["status"];
