export { IncidentStatus, AlertType, AlertSource, AlertSeverity } from "../../generated/prisma/client";
import type { AlertSeverity, AlertSource, AlertType } from "../../generated/prisma/client";

export interface CheckResult {
  websiteId: string;
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number;
}

export type HistoryRange = "24h" | "7d" | "30d";

export interface HistoryStats {
  total: number;
  successful: number;
  failed: number;
  uptimePercentage: number | null;
  averageResponseTimeMs: number | null;
}

// Stage 15.4: unified Alert read contract. All three optional filters
// combine with AND semantics — a filter that's omitted simply isn't added
// to the query, never defaulted to "match everything" via a wildcard value.
export interface AlertFilters {
  source?: AlertSource;
  severity?: AlertSeverity;
  type?: AlertType;
}

// Exactly the fields exposed by the unified GET /websites/:id/alerts
// endpoint — deliberately never a full Prisma Alert row (which would also
// carry relation fields if ever `include`d) and never a related
// Incident/SeoCheck/PerformanceCheck/Website/User object. The five
// original fields (id, incidentId, websiteId, type, createdAt) are
// preserved byte-for-byte from the pre-Stage-15.4 contract; every other
// field is additive.
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
  createdAt: Date;
}

export interface AlertListResult {
  alerts: AlertRecord[];
  total: number;
  truncated: boolean;
}
