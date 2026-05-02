import { QuotesPageClient } from "@/components/quotes/quotes-page-client";

// Thin server component — the (manager) layout already gated the
// route. All interactivity lives in <QuotesPageClient>.
export default function QuotesPage() {
  return <QuotesPageClient />;
}
