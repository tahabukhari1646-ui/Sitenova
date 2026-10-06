import type { Incident, MonitoringCheck } from "@/types";

export type UptimeStatus = "up" | "down" | "unknown";

export const INCIDENT_STATUS_BADGE = {
  OPEN: "critical",
  RESOLVED: "healthy",
} as const;

export function getUptimeStatus(
  check: MonitoringCheck | null | undefined
): UptimeStatus {
  if (!check) return "unknown";
  return check.success ? "up" : "down";
}

export const UPTIME_STATUS_BADGE = {
  up: "healthy",
  down: "critical",
  unknown: "inactive",
} as const;

export function formatRelativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
}

export function formatLastChecked(
  check: MonitoringCheck | null | undefined
): string {
  if (!check) return "Never checked";
  return formatRelativeTime(check.checkedAt);
}

export function formatExactTime(
  check: MonitoringCheck | null | undefined
): string | undefined {
  if (!check) return undefined;
  return new Date(check.checkedAt).toLocaleString();
}

export function formatUptimePercentage(value: number | null): string {
  if (value === null) return "No data";
  return `${value.toFixed(2)}%`;
}

export function formatResponseTime(value: number | null): string {
  if (value === null) return "No data";
  return `${value} ms`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

// null means "not resolved yet" — callers must not fabricate a duration for
// an ongoing incident.
export function getIncidentDurationMs(incident: Incident): number | null {
  if (!incident.resolvedAt) return null;
  return (
    new Date(incident.resolvedAt).getTime() -
    new Date(incident.startedAt).getTime()
  );
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(Math.round(ms / 1000), 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
