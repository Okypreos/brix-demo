import { QuotesPageClient } from "@/components/quotes/quotes-page-client";

/**
 * Manager quotes page.
 *
 * Kept as a thin server component because the layout above already did
 * the role-gate (`app/(manager)/layout.tsx`). All interactivity lives
 * in <QuotesPageClient> — tab switching, the new-quote sheet, and the
 * reactive subscription to `api.quotes.list` are all client-side.
 */
export default function QuotesPage() {
  return <QuotesPageClient />;
}
