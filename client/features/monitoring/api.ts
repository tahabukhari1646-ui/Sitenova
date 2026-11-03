import { apiFetch } from "@/lib/api-client";
import type { IncidentStatus } from "@/types";
import type {
  HistoryRange,
  HistoryResult,
  IncidentAiAnalysisResult,
  IncidentLatestAiAnalysisResult,
  IncidentsResult,
  LatestCheckResult,
  ManualCheckResult,
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

// One uptime check right now -- no request body. Saved through the same path
// as the scheduler's, so it can also open/resolve an incident and create the
// matching alert, notification and email.
export function runUptimeCheck(websiteId: string): Promise<ManualCheckResult> {
  return apiFetch<ManualCheckResult>(`/websites/${websiteId}/check`, {
    method: "POST",
  });
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
