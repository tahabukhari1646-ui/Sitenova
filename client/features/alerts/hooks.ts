"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import { getAlerts } from "./api";
import type { AlertFilters } from "./types";

export const alertKeys = {
  // Filters are part of the key itself (not a static root) so each distinct
  // filter combination gets its own cache entry — changing a filter is a
  // genuinely different query, never a client-side re-filter of stale data.
  list: (websiteId: string, filters: AlertFilters) =>
    ["websites", websiteId, "alerts", filters.source ?? "all", filters.severity ?? "all", filters.type ?? "all"] as const,
  // Prefix (no filters) — used only for invalidation from other features'
  // manual-check mutations (SEO, Performance), so every cached filter
  // combination for this website refreshes at once without those features
  // needing to know the exact filter shape.
  all: (websiteId: string) => ["websites", websiteId, "alerts"] as const,
};

function toErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : fallback;
}

export function useWebsiteAlerts(websiteId: string, filters: AlertFilters) {
  const query = useQuery({
    queryKey: alertKeys.list(websiteId, filters),
    queryFn: () => getAlerts(websiteId, filters),
    enabled: Boolean(websiteId),
  });

  return {
    alerts: query.data?.alerts ?? [],
    total: query.data?.total ?? 0,
    truncated: query.data?.truncated ?? false,
    isLoading: query.isPending,
    isError: query.isError,
    error: toErrorMessage(query.error, "Failed to load alerts."),
    refetch: query.refetch,
  };
}
