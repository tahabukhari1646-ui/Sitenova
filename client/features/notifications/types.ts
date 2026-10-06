import type { AlertSeverity, AlertSource, AlertType } from "@/features/alerts/types";

export type NotificationChannel = "IN_APP";

export type NotificationStatusFilter = "ALL" | "READ" | "UNREAD";

// Minimal, explicitly-selected Website fields only -- mirrors the Stage
// 15.6 backend contract exactly, never a full Website object.
export interface NotificationWebsiteSummary {
  id: string;
  name: string | null;
  url: string;
}

// Same field set as AlertRecord (features/alerts/types.ts) minus the
// backend traceability FKs (incidentId/seoCheckId/performanceCheckId),
// which GET /notifications never returns -- plus the nested website
// summary. Reuses AlertSeverity/AlertSource/AlertType rather than
// redefining them, since this is genuinely the same Alert shape, not a
// parallel concept.
export interface NotificationAlertSummary {
  id: string;
  websiteId: string;
  source: AlertSource;
  type: AlertType;
  severity: AlertSeverity;
  code: string | null;
  message: string | null;
  createdAt: string;
  website: NotificationWebsiteSummary;
}

export interface NotificationRecord {
  id: string;
  channel: NotificationChannel;
  readAt: string | null;
  createdAt: string;
  alert: NotificationAlertSummary;
}

export interface NotificationListResult {
  notifications: NotificationRecord[];
  total: number;
  // Always the true global unread count for the authenticated user,
  // regardless of which `status` filter produced `notifications`/`total`
  // (Stage 15.6's verified backend semantics) -- safe to read from any
  // status variant's response for the bell badge.
  unread: number;
  truncated: boolean;
}

export interface MarkOneReadResult {
  notification: { id: string; readAt: string | null };
}

export interface MarkAllReadResult {
  updated: number;
}
