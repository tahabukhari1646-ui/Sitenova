"use client";

import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarkAllNotificationsRead, useNotifications } from "../hooks";
import type { NotificationStatusFilter } from "../types";
import { NotificationEmptyState } from "./NotificationEmptyState";
import { NotificationFilters } from "./NotificationFilters";
import { NotificationItem } from "./NotificationItem";

interface NotificationPanelProps {
  status: NotificationStatusFilter;
  onStatusChange: (status: NotificationStatusFilter) => void;
  onClose: () => void;
}

function NotificationListSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

// Opening this panel never mutates read state on its own (Stage 15.7 §41/
// §42) -- only an explicit notification click or "Mark all as read" does.
export function NotificationPanel({ status, onStatusChange, onClose }: NotificationPanelProps) {
  const { notifications, total, unread, truncated, isLoading, isError, error, refetch } =
    useNotifications(status);
  const { markAllRead, isMarkingAll } = useMarkAllNotificationsRead();

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-border">
        <SheetTitle>Notifications</SheetTitle>
        <SheetDescription>
          {unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "You're all caught up."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <NotificationFilters value={status} onChange={onStatusChange} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => markAllRead()}
          disabled={unread === 0 || isMarkingAll}
        >
          {isMarkingAll ? "Marking..." : "Mark all as read"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <NotificationListSkeleton />
        ) : isError ? (
          <div className="px-2">
            <ErrorState
              title="Unable to load notifications"
              description={error ?? undefined}
              action={
                <Button variant="outline" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : notifications.length === 0 ? (
          <NotificationEmptyState status={status} />
        ) : (
          <div className="flex flex-col gap-1">
            {notifications.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} onNavigate={onClose} />
            ))}
            {truncated && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Showing latest {notifications.length} of {total} notifications
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
