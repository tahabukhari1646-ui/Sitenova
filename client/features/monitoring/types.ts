import type { Incident, MonitoringCheck } from "@/types";

export interface LatestCheckResult {
  check: MonitoringCheck | null;
}

export type HistoryRange = "24h" | "7d" | "30d";

export interface HistoryStats {
  total: number;
  successful: number;
  failed: number;
  uptimePercentage: number | null;
  averageResponseTimeMs: number | null;
}

export interface HistoryResult {
  checks: MonitoringCheck[];
  stats: HistoryStats;
}

export interface IncidentsResult {
  incidents: Incident[];
}
