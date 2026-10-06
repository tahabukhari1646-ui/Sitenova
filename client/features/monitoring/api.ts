import { apiFetch } from "@/lib/api-client";
import type { IncidentStatus } from "@/types";
import type {
  HistoryRange,
  HistoryResult,
  IncidentsResult,
  LatestCheckResult,
} from "./types";

export function getLatestCheck(websiteId: string): Promise<LatestCheckResult> {
  return apiFetch<LatestCheckResult>(`/websites/${websiteId}/latest`);
}

export function getHistory(
  websiteId: string,
  range: HistoryRange
): Promise<HistoryResult> {
  return apiFetch<HistoryResult>(`/websites/${websiteId}/checks?range=${range}`);
}

export function getIncidents(
  websiteId: string,
  status?: IncidentStatus
): Promise<IncidentsResult> {
  const query = status ? `?status=${status}` : "";
  return apiFetch<IncidentsResult>(`/websites/${websiteId}/incidents${query}`);
}
