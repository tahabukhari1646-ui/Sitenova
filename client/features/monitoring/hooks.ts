"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import type { IncidentStatus, MonitoringCheck } from "@/types";
import { getHistory, getIncidents, getLatestCheck } from "./api";
import type { HistoryRange } from "./types";

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
