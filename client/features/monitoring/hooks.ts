"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { alertKeys } from "@/features/alerts/hooks";
import { notificationKeys } from "@/features/notifications/hooks";
import { ApiError } from "@/lib/api-client";
import type { IncidentStatus, MonitoringCheck } from "@/types";
import {
  getHistory,
  getIncidents,
  getLatestCheck,
  getLatestIncidentAiAnalysis,
  runIncidentAiAnalysis,
  runUptimeCheck,
} from "./api";
import type { HistoryRange, IncidentAiAnalysis } from "./types";

// Stage 18.6: a separate root from the incident list's own
// ["websites", id, "incidents", status] keys, so the two can never collide,
// share, or be invalidated together. Keyed by the exact incident id.
export const incidentAiKeys = {
  latest: (websiteId: string, incidentId: string) =>
    ["websites", websiteId, "incidentAi", incidentId] as const,
};

function toAiErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : fallback;
}

// The backend's monitoring cron runs every 60s (server/src/modules/monitor/scheduler.ts).
// Polling somewhat faster than that surfaces a fresh automatic check promptly
// without meaningfully increasing load, since React Query pauses this
// automatically when the tab is backgrounded (refetchIntervalInBackground
// defaults to false).
const STATUS_POLL_INTERVAL_MS = 30_000;

export function useWebsiteStatus(id: string) {
  const query = useQuery({
    queryKey: ["websites", id, "status"],
    queryFn: () => getLatestCheck(id).then((result) => result.check),
    enabled: Boolean(id),
    refetchInterval: STATUS_POLL_INTERVAL_MS,
  });

  return {
    check: query.data ?? null,
    isLoading: query.isPending,
    error:
      query.error instanceof ApiError
        ? query.error.message
        : query.error
          ? "Failed to load status."
          : null,
  };
}

// Same one-request-per-website pattern as useWebsiteStatus, aggregated for
// screens (like the dashboard) that need several websites' statuses at once.
// Shares its queryKey with useWebsiteStatus, so a website already polled on
// another screen doesn't trigger a second request for the same data.
export function useWebsiteStatuses(ids: string[]) {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["websites", id, "status"],
      queryFn: () => getLatestCheck(id).then((result) => result.check),
      enabled: Boolean(id),
      refetchInterval: STATUS_POLL_INTERVAL_MS,
    })),
  });

  return ids.map((id, index) => ({
    id,
    check: (results[index]?.data ?? null) as MonitoringCheck | null,
    isLoading: results[index]?.isPending ?? true,
  }));
}

// Historical data changes only when a new check lands (every ~60s on the
// backend) and the user can only view one range at a time, so this is a
// plain cached query, not a poller — keeping it separate from
// useWebsiteStatus's 30s live-status polling per Stage 9's scope.
export function useWebsiteHistory(id: string, range: HistoryRange) {
  const query = useQuery({
    queryKey: ["websites", id, "checks", range],
    queryFn: () => getHistory(id, range),
    enabled: Boolean(id),
  });

  return {
    checks: query.data?.checks ?? [],
    stats: query.data?.stats ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    error:
      query.error instanceof ApiError
        ? query.error.message
        : query.error
          ? "Failed to load monitoring history."
          : null,
    refetch: query.refetch,
  };
}

// Incidents are read-only from the frontend's perspective — the backend
// monitoring cycle is the sole source of incident creation/resolution (Stage
// 11.4). No polling here: unlike live status, there's no need to surface a
// newly-opened incident within seconds: revisiting/refetching the page is
// sufficient. Status is part of the query key so "All"/"Open"/"Resolved"
// never share a cache entry.
export function useIncidents(id: string, status?: IncidentStatus) {
  const query = useQuery({
    queryKey: ["websites", id, "incidents", status ?? "all"],
    queryFn: () => getIncidents(id, status).then((result) => result.incidents),
    enabled: Boolean(id),
  });

  return {
    incidents: query.data ?? [],
    isLoading: query.isPending,
    isError: query.isError,
    error:
      query.error instanceof ApiError
        ? query.error.message
        : query.error
          ? "Failed to load incidents."
          : null,
    refetch: query.refetch,
  };
}

// Manual "Check uptime now". The backend saves it through the same
// transaction as the scheduler's checks, so besides status and history it can
// open/resolve an incident and create an alert + notification -- every one of
// those caches is refreshed. Prefix keys: all history ranges, all incident
// filters and all alert filters at once. If nothing changed, these are
// harmless no-op refetches.
export function useRunUptimeCheck(websiteId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => runUptimeCheck(websiteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["websites", websiteId, "status"] });
      queryClient.invalidateQueries({ queryKey: ["websites", websiteId, "checks"] });
      queryClient.invalidateQueries({ queryKey: ["websites", websiteId, "incidents"] });
      queryClient.invalidateQueries({ queryKey: alertKeys.all(websiteId) });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    runCheck: () => mutation.mutate(),
    isRunning: mutation.isPending,
    error: toAiErrorMessage(mutation.error, "Unable to complete uptime check."),
  };
}

// Stage 18.6: the stored latest SUCCEEDED AI diagnosis for one exact
// incident. Read-only; never triggers an analysis; no refetchInterval.
// `enabled` lets the panel fetch ONLY when it is opened, so a list of many
// incidents never fires one request per row on page load.
export function useLatestIncidentAiAnalysis(
  websiteId: string,
  incidentId: string,
  enabled: boolean
) {
  const query = useQuery({
    queryKey: incidentAiKeys.latest(websiteId, incidentId),
    queryFn: () =>
      getLatestIncidentAiAnalysis(websiteId, incidentId).then((result) => result.analysis),
    enabled: enabled && Boolean(websiteId) && Boolean(incidentId),
  });

  return {
    analysis: query.data ?? null,
    isLoading: query.isPending && query.fetchStatus !== "idle",
    isError: query.isError,
  };
}

// Stage 18.6: mirrors useRunSeoAiAnalysis. On a SUCCEEDED result the response
// is also written into THAT incident's cache entry (keyed by the incident
// the request was FOR); non-SUCCEEDED results are never cached as "latest".
export function useRunIncidentAiAnalysis(websiteId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ incidentId }: { incidentId: string }) =>
      runIncidentAiAnalysis(websiteId, incidentId).then((result) => result.analysis),
    onSuccess: (analysis: IncidentAiAnalysis, { incidentId }) => {
      if (analysis.status === "SUCCEEDED" && analysis.output !== null) {
        queryClient.setQueryData(incidentAiKeys.latest(websiteId, incidentId), analysis);
      }
    },
  });

  return {
    analyze: (incidentId: string) => mutation.mutate({ incidentId }),
    analysis: mutation.data ?? null,
    requestedIncidentId: mutation.variables?.incidentId ?? null,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: toAiErrorMessage(mutation.error, "AI analysis failed."),
    reset: mutation.reset,
  };
}
