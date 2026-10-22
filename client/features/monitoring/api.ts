import { apiFetch } from "@/lib/api-client";
import type { IncidentStatus } from "@/types";
import type {
  HistoryRange,
  HistoryResult,
  IncidentAiAnalysisResult,
  IncidentLatestAiAnalysisResult,
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

// Stage 18.6: manual AI diagnosis of one stored incident -- no request body;
// the backend derives everything from the URL params and the authenticated
// user. Never runs a monitoring check.
export function runIncidentAiAnalysis(
  websiteId: string,
  incidentId: string
): Promise<IncidentAiAnalysisResult> {
  return apiFetch<IncidentAiAnalysisResult>(
    `/websites/${websiteId}/incidents/${incidentId}/ai-analysis`,
    { method: "POST" }
  );
}

// Stage 18.6: read-only -- the newest stored successful diagnosis for this
// exact incident, or `analysis: null`. Never triggers a new analysis.
export function getLatestIncidentAiAnalysis(
  websiteId: string,
  incidentId: string
): Promise<IncidentLatestAiAnalysisResult> {
  return apiFetch<IncidentLatestAiAnalysisResult>(
    `/websites/${websiteId}/incidents/${incidentId}/ai-analysis/latest`
  );
}
