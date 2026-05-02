"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CalendarPlus, CheckCircle2, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format/datetime";

// Header bell with a popover of recent notifications.
//
// Subscribes to `unreadCountForCurrentUser` (badge) and
// `listForCurrentUser` (body). Convex pushes updates the moment a
// job is assigned/rescheduled/completed anywhere — no polling.
//
// markRead doesn't need optimistic UI — the reactive query re-fires
// within ~50ms of commit.

type Notification = Doc<"notifications">;

const KIND_META: Record<
  Notification["kind"],
  { icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  job_assigned: { icon: CalendarPlus, tone: "text-blue-600 dark:text-blue-400" },
  job_updated: {
    icon: RefreshCw,
    tone: "text-amber-600 dark:text-amber-400",
  },
  job_completed: {
    icon: CheckCircle2,
    tone: "text-emerald-600 dark:text-emerald-400",
  },
};

export function NotificationBell() {
  const unreadCount = useQuery(api.notifications.unreadCountForCurrentUser);
  const notifications = useQuery(api.notifications.listForCurrentUser);
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const isLoading = unreadCount === undefined || notifications === undefined;
  const hasUnread = (unreadCount ?? 0) > 0;
  const displayCount = (unreadCount ?? 0) > 9 ? "9+" : String(unreadCount ?? 0);

  // Re-mount <Bell> on each unread count *increase* so the single-shot
  // CSS animation restarts (CSS animations don't replay on re-render).
  // Skip the initial value — first paint triggers the animation
  // natively. Only bump on subsequent increases (3 -> 4 etc).
  const [shakeKey, setShakeKey] = useState(0);
  const prevCountRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (unreadCount === undefined) return;
    const prev = prevCountRef.current;
    prevCountRef.current = unreadCount;
    if (prev !== undefined && unreadCount > prev) {
      setShakeKey((k) => k + 1);
    }
  }, [unreadCount]);

  async function onClickRow(notif: Notification) {
    if (notif.readAt !== undefined) return;
    try {
      await markRead({ notificationId: notif._id });
    } catch (err) {
      const message =
        err instanceof ConvexError && typeof err.data === "object"
          ? (err.data as { message?: string }).message ?? "Could not mark read."
          : "Could not mark read.";
      toast.error(message);
    }
  }

  async function onMarkAll() {
    try {
      const { marked } = await markAllRead({});
      if (marked > 0) {
        toast.success(`Marked ${marked} as read`);
      }
    } catch {
      toast.error("Could not mark all read.");
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            hasUnread
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          className="relative"
        >
          <Bell
            // key={shakeKey} re-mounts to restart the animation.
            // motion-safe respects prefers-reduced-motion.
            key={shakeKey}
            className={cn(
              "size-5 origin-top",
              hasUnread && "motion-safe:animate-bell-shake",
            )}
          />
          {hasUnread ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
            >
              {displayCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-medium text-sm">Notifications</span>
          {hasUnread ? (
            <button
              type="button"
              onClick={onMarkAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <Separator />
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <NotificationListSkeleton />
          ) : notifications.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-border">
              {notifications.slice(0, 10).map((n: Notification) => (
                <NotificationRow
                  key={n._id}
                  notification={n}
                  onClick={() => onClickRow(n)}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const isUnread = notification.readAt === undefined;
  const meta = KIND_META[notification.kind];
  const Icon = meta.icon;

  // div, not button — Checkbox is itself a button under the hood and
  // we don't want nested-interactive-element warnings. Text area is
  // its own button; checkbox is a sibling.
  return (
    <li>
      <div
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 transition-colors",
          isUnread && "bg-secondary/20",
        )}
      >
        <span
          className={cn(
            "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary",
            meta.tone,
          )}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        <button
          type="button"
          onClick={onClick}
          disabled={!isUnread}
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-0.5 text-left rounded-sm",
            "hover:bg-secondary/40 focus:bg-secondary/40 focus:outline-none",
            "disabled:cursor-default disabled:hover:bg-transparent disabled:focus:bg-transparent",
            "px-1 -mx-1 py-0.5 -my-0.5",
          )}
        >
          <span className="text-sm font-medium leading-snug truncate">
            {notification.message}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(notification._creationTime)}
          </span>
        </button>
        {/* One-way: disabled once read. No markUnread by design. */}
        <Checkbox
          checked={!isUnread}
          disabled={!isUnread}
          onCheckedChange={(checked) => {
            if (checked === true && isUnread) onClick();
          }}
          aria-label={isUnread ? "Mark as read" : "Read"}
          className="mt-1.5 shrink-0"
        />
      </div>
    </li>
  );
}

function NotificationListSkeleton() {
  return (
    <div className="flex flex-col">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0"
        >
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <Bell className="size-8 text-muted-foreground/40" />
      <span className="text-sm font-medium text-muted-foreground">
        No notifications yet
      </span>
      <span className="text-xs text-muted-foreground/70">
        You&apos;ll see updates here when jobs are assigned or completed.
      </span>
    </div>
  );
}
