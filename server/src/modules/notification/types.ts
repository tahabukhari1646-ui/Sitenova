export { NotificationChannel } from "../../generated/prisma/client";
import type { AlertSeverity, AlertSource, AlertType, NotificationChannel } from "../../generated/prisma/client";

// Not a persisted enum — purely a query-parameter shape, mirroring how
// monitor/seo history query params are typed in their own modules.
export type NotificationStatusFilter = "ALL" | "READ" | "UNREAD";

// Minimal, explicitly-selected Website display fields only (Stage 15.6
// §17/§42) — never the full Website row, never its `user` relation.
export interface NotificationWebsiteSummary {
  id: string;
  name: string | null;
  url: string;
}

// The Alert fields a Notification needs to render its content — deliberately
// the same shape philosophy as the Stage 15.4 unified Alert API (explicit
// select, no incidentId/seoCheckId/performanceCheckId exposed here either,
// since those are backend traceability fields regardless of which endpoint
// is asking).
export interface NotificationAlertSummary {
  id: string;
  websiteId: string;
  source: AlertSource;
  type: AlertType;
  severity: AlertSeverity;
  code: string | null;
  message: string | null;
  createdAt: Date;
  website: NotificationWebsiteSummary | null;
}

export interface NotificationRecord {
  id: string;
  channel: NotificationChannel;
  readAt: Date | null;
  createdAt: Date;
  alert: NotificationAlertSummary;
}

export interface NotificationListResult {
  notifications: NotificationRecord[];
  total: number;
  // Always the GLOBAL unread count for this user, regardless of the
  // `status` filter applied to `notifications`/`total` (Stage 15.6 §20) —
  // so a future navbar/inbox can reuse this one field consistently no
  // matter which status tab is currently selected.
  unread: number;
  truncated: boolean;
}
