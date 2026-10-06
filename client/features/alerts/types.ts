export type AlertSource = "UPTIME" | "SEO" | "PERFORMANCE";

export type AlertSeverity = "INFO" | "WARNING" | "ERROR";

export type AlertType =
  | "INCIDENT_OPENED"
  | "INCIDENT_RESOLVED"
  | "SEO_ISSUE_OPENED"
  | "SEO_ISSUE_RESOLVED"
  | "PERFORMANCE_DEGRADED"
  | "PERFORMANCE_RECOVERED";

// Mirrors the Stage 15.4 backend contract exactly — every field the API
// returns, nothing invented, nothing renamed. incidentId/seoCheckId/
// performanceCheckId are backend traceability fields only; the UI never
// displays them prominently (see AlertItem.tsx).
export interface AlertRecord {
  id: string;
  websiteId: string;
  source: AlertSource;
  type: AlertType;
  severity: AlertSeverity;
  code: string | null;
  message: string | null;
  incidentId: string | null;
  seoCheckId: string | null;
  performanceCheckId: string | null;
  createdAt: string;
}

export interface AlertListResult {
  alerts: AlertRecord[];
  total: number;
  truncated: boolean;
}

// All three filters are independently optional and combine with backend AND
// semantics — the frontend never re-filters client-side after receiving
// data; the backend remains the sole source of truth for what matches.
export interface AlertFilters {
  source?: AlertSource;
  severity?: AlertSeverity;
  type?: AlertType;
}
