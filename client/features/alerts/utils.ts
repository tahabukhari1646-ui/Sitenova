import type { AlertRecord, AlertSeverity, AlertSource, AlertType } from "./types";

type BadgeStatus = "healthy" | "warning" | "critical" | "inactive";

export const SEVERITY_BADGE_STATUS: Record<AlertSeverity, BadgeStatus> = {
  ERROR: "critical",
  WARNING: "warning",
  INFO: "inactive",
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  ERROR: "Error",
  WARNING: "Warning",
  INFO: "Info",
};

export const SOURCE_LABEL: Record<AlertSource, string> = {
  UPTIME: "Uptime",
  SEO: "SEO",
  PERFORMANCE: "Performance",
};

export const TYPE_LABEL: Record<AlertType, string> = {
  INCIDENT_OPENED: "Incident opened",
  INCIDENT_RESOLVED: "Incident resolved",
  SEO_ISSUE_OPENED: "SEO issue detected",
  SEO_ISSUE_RESOLVED: "SEO issue resolved",
  PERFORMANCE_DEGRADED: "Performance degraded",
  PERFORMANCE_RECOVERED: "Performance recovered",
};

// UI-presentation fallback ONLY, keyed off the stable `type` enum — never
// mutates or persists Alert.message. Historical Uptime alerts have
// message=null by design (Stage 15.1); every SEO/Performance alert always
// has a real message, so this table only needs uptime's two types.
const TYPE_MESSAGE_FALLBACK: Partial<Record<AlertType, string>> = {
  INCIDENT_OPENED: "The website was confirmed down.",
  INCIDENT_RESOLVED: "The website recovered.",
};

export function getAlertDisplayMessage(alert: Pick<AlertRecord, "type" | "message">): string {
  if (alert.message) return alert.message;
  return TYPE_MESSAGE_FALLBACK[alert.type] ?? TYPE_LABEL[alert.type];
}

export function formatAlertTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}
