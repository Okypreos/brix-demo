import { MapPin, User, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QuoteStatusBadge } from "./quote-status-badge";
import { QuoteCardActions } from "./quote-card-actions";
import type { Quote } from "@/lib/types";
import { formatCreatedAgo } from "@/lib/format/time";

// One quote as a card. Interactive bits live in <QuoteCardActions> so
// the card itself stays a server component — only the action row
// pays the client-component cost.
export function QuoteCard({ quote }: { quote: Quote }) {
  return (
    <Card size="sm" className="flex flex-col gap-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base normal-case tracking-normal">
            {quote.title}
          </CardTitle>
          <QuoteStatusBadge status={quote.status} />
        </div>
        {quote.description && (
          <CardDescription className="line-clamp-2">
            {quote.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <User className="size-3.5 text-muted-foreground" />
          <span>{quote.customerName}</span>
        </div>
        {quote.customerAddress && (
          <div className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="size-3.5 shrink-0 mt-0.5" />
            <span className="line-clamp-1">{quote.customerAddress}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="size-3.5" />
          <span>{formatHours(quote.estimatedHours)} estimated</span>
          <span aria-hidden>·</span>
          <span>Created {formatCreatedAgo(quote._creationTime)}</span>
        </div>
      </CardContent>
      <CardFooter>
        <QuoteCardActions quote={quote} />
      </CardFooter>
    </Card>
  );
}

// 1 -> "1 hour", 2.5 -> "2.5 hours", 0.5 -> "30 min".
function formatHours(hours: number) {
  if (hours < 1) return `${hours * 60} min`;
  if (hours === 1) return "1 hour";
  return `${hours} hours`;
}
