import { apiFetch } from "@/lib/api-client";
import type { AlertFilters, AlertListResult } from "./types";

// apiFetch already attaches auth (Bearer token) and handles the 401 ->
// redirect flow — nothing Alert-specific needed here beyond building the
// query string safely.
export function getAlerts(websiteId: string, filters: AlertFilters = {}): Promise<AlertListResult> {
  const params = new URLSearchParams();
  if (filters.source) params.set("source", filters.source);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.type) params.set("type", filters.type);

  const query = params.toString();
  return apiFetch<AlertListResult>(`/websites/${websiteId}/alerts${query ? `?${query}` : ""}`);
}
