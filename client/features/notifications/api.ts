import { apiFetch } from "@/lib/api-client";
import type {
  MarkAllReadResult,
  MarkOneReadResult,
  NotificationListResult,
  NotificationStatusFilter,
} from "./types";

// apiFetch already attaches auth and derives the user from the token --
// never sends a userId. "ALL" is the backend's own default, so it's
// omitted from the query string rather than sent explicitly.
export function getNotifications(status: NotificationStatusFilter = "ALL"): Promise<NotificationListResult> {
  const query = status !== "ALL" ? `?status=${status}` : "";
  return apiFetch<NotificationListResult>(`/notifications${query}`);
}

export function markNotificationRead(id: string): Promise<MarkOneReadResult> {
  return apiFetch<MarkOneReadResult>(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead(): Promise<MarkAllReadResult> {
  return apiFetch<MarkAllReadResult>("/notifications/read-all", { method: "PATCH" });
}
