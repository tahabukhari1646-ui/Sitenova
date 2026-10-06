"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { SEVERITY_BADGE_STATUS, SEVERITY_LABEL, SOURCE_LABEL, TYPE_LABEL, formatAlertTimestamp, getAlertDisplayMessage } from "@/features/alerts/utils";
import { cn } from "@/lib/utils";
import { useMarkNotificationRead } from "../hooks";
import type { NotificationRecord } from "../types";

interface NotificationItemProps {
  notification: NotificationRecord;
  onNavigate: () => void;
}

// Reuses the exact Stage 15.5 Alert presentation utilities (severity badge
// mapping, type labels, null-message fallback, timestamp formatting) --
// deliberately no second/conflicting mapping is defined here (Stage 15.7
// §17/§18). Rendered as a real <Link> (not a div+router.push) so native
// anchor semantics (middle-click/Cmd-click open-in-new-tab, screen-reader
// link role) all work correctly for free.
export function NotificationItem({ notification, onNavigate }: NotificationItemProps) {
  const { markRead } = useMarkNotificationRead();
  const isUnread = notification.readAt === null;
  const { alert } = notification;

  function handleClick() {
    // Fire-and-forget: navigation must never be blocked by a slow or
    // failing read-state mutation (Stage 15.7 §23) -- if this fails, the
    // notification simply remains unread and can be retried later (e.g.
    // the next successful mark-all, or clicking it again).
    if (isUnread) {
      markRead(notification.id).catch(() => {});
    }
    onNavigate();
  }

  return (
    <Link
      href={`/websites/${alert.websiteId}`}
      onClick={handleClick}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        isUnread && "bg-accent/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isUnread && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />}
        <span className={cn(isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
          {TYPE_LABEL[alert.type]}
        </span>
        <StatusBadge status={SEVERITY_BADGE_STATUS[alert.severity]} label={SEVERITY_LABEL[alert.severity]} />
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {SOURCE_LABEL[alert.source]}
        </span>
        {isUnread && <span className="sr-only">(unread)</span>}
      </div>

      <p className="break-words text-xs text-muted-foreground">{getAlertDisplayMessage(alert)}</p>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground">{alert.website.name ?? alert.website.url}</span>
        <span className="shrink-0">{formatAlertTimestamp(notification.createdAt)}</span>
      </div>
    </Link>
  );
}
