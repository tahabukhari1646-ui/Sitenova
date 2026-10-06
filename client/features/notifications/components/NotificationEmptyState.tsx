import { EmptyState } from "@/components/shared/EmptyState";
import type { NotificationStatusFilter } from "../types";

const MESSAGES: Record<NotificationStatusFilter, string> = {
  ALL: "No notifications yet",
  UNREAD: "No unread notifications",
  READ: "No read notifications",
};

interface NotificationEmptyStateProps {
  status: NotificationStatusFilter;
}

export function NotificationEmptyState({ status }: NotificationEmptyStateProps) {
  return <EmptyState title={MESSAGES[status]} />;
}
