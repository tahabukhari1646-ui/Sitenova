"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import { alertKeys } from "@/features/alerts/hooks";
import { notificationKeys } from "@/features/notifications/hooks";
import {
  getPerformanceHistory,
  getPerformanceLatestCheck,
  getPerformanceStats,
  runPerformanceAiAnalysis,
  runPerformanceCheck,
} from "./api";
import type { PerformanceHistoryRange, PerformanceStrategy } from "./types";

// Stage P1: `pageUrl` is now part of every key, exactly like `strategy`
// already was — a homepage MOBILE query and a /services/ MOBILE query must
// never share, invalidate, or be confused with each other's cache entry.
export const performanceKeys = {
  stats: (websiteId: string, strategy: PerformanceStrategy, pageUrl: string) =>
    ["websites", websiteId, "performance", "stats", strategy, pageUrl] as const,
  // Deliberately a separate root from `stats` (per Stage 13.7 scope) — never
  // combined into one query, so a history fetch/invalidation can never
  // affect the stats cards and vice versa. `pageUrl` sits BEFORE `range` so
  // the prefix below can invalidate every range for one page without
  // touching any other page's history.
  history: (
    websiteId: string,
    strategy: PerformanceStrategy,
    pageUrl: string,
    range: PerformanceHistoryRange
  ) => ["websites", websiteId, "performance", "history", strategy, pageUrl, range] as const,
  // Prefix (no range) — used only for invalidation, to refresh every range
  // variant of one strategy+pageUrl's history at once without touching any
  // other strategy or page (React Query matches this as a prefix of the
  // full key above).
  historyByStrategyAndPage: (websiteId: string, strategy: PerformanceStrategy, pageUrl: string) =>
    ["websites", websiteId, "performance", "history", strategy, pageUrl] as const,
  // Stage 16.4: a separate root from `stats` -- this query exists solely to
  // learn the current latest PerformanceCheck's real id (see
  // getPerformanceLatestCheck's own doc comment); it must never share a
  // cache entry with the stats query, which fetches different data (no id)
  // from a different endpoint.
  latestCheck: (websiteId: string, strategy: PerformanceStrategy, pageUrl: string) =>
    ["websites", websiteId, "performance", "latestCheck", strategy, pageUrl] as const,
};

function toErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : fallback;
}

export function usePerformanceStats(
  websiteId: string,
  strategy: PerformanceStrategy,
  pageUrl: string
) {
  const query = useQuery({
    queryKey: performanceKeys.stats(websiteId, strategy, pageUrl),
    queryFn: () =>
      getPerformanceStats(websiteId, strategy, pageUrl).then((result) => result.stats),
    enabled: Boolean(websiteId) && Boolean(pageUrl),
  });

  return {
    stats: query.data ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    error: toErrorMessage(query.error, "Failed to load performance stats."),
    refetch: query.refetch,
  };
}

export function usePerformanceHistory(
  websiteId: string,
  strategy: PerformanceStrategy,
  range: PerformanceHistoryRange,
  pageUrl: string
) {
  const query = useQuery({
    queryKey: performanceKeys.history(websiteId, strategy, pageUrl, range),
    queryFn: () => getPerformanceHistory(websiteId, strategy, range, pageUrl),
    enabled: Boolean(websiteId) && Boolean(pageUrl),
  });

  return {
    history: query.data ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    error: toErrorMessage(query.error, "Failed to load performance history."),
    refetch: query.refetch,
  };
}

// Stage 16.4: the sole source of a real PerformanceCheck id for the
// currently selected strategy+pageUrl (see getPerformanceLatestCheck's own
// doc comment for why this can't come from usePerformanceStats). Used only
// to target the AI analysis mutation -- never rendered as the primary
// metrics display, which remains usePerformanceStats's job unchanged.
export function usePerformanceLatestCheck(
  websiteId: string,
  strategy: PerformanceStrategy,
  pageUrl: string
) {
  const query = useQuery({
    queryKey: performanceKeys.latestCheck(websiteId, strategy, pageUrl),
    queryFn: () => getPerformanceLatestCheck(websiteId, strategy, pageUrl),
    enabled: Boolean(websiteId) && Boolean(pageUrl),
  });

  return {
    check: query.data?.check ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    error: toErrorMessage(query.error, "Failed to load the latest performance check."),
  };
}

interface RunPerformanceCheckArgs {
  strategy: PerformanceStrategy;
  pageUrl: string;
}

// Strategy AND pageUrl are passed at call time (not captured from a hook
// argument) so the mutation always runs against whichever strategy/page was
// actually selected+committed when the button was clicked, and invalidates
// only that exact (strategy, pageUrl) combination's cache entries on
// success — a manual subpage test never invalidates, refreshes, or is
// confused with the homepage's own stats/history, and MOBILE/DESKTOP never
// cross-invalidate each other (Stage P1 §18/§21). Alerts ARE invalidated
// (Stage 15.5) since a manual check may produce a new PERFORMANCE_DEGRADED/
// RECOVERED alert — this only refreshes the Alerts section's cached query,
// it never touches Alert generation itself.
export function useRunPerformanceCheck(websiteId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ strategy, pageUrl }: RunPerformanceCheckArgs) =>
      runPerformanceCheck(websiteId, strategy, pageUrl),
    onSuccess: (_result, { strategy, pageUrl }) => {
      queryClient.invalidateQueries({
        queryKey: performanceKeys.stats(websiteId, strategy, pageUrl),
      });
      // Prefix match: refreshes every range (24h/7d/30d) of this
      // strategy+page's history in one call, without touching any other
      // strategy or page.
      queryClient.invalidateQueries({
        queryKey: performanceKeys.historyByStrategyAndPage(websiteId, strategy, pageUrl),
      });
      // Stage 16.4: a fresh manual test creates a NEW latest PerformanceCheck
      // row -- this id must refresh too, so the AI Analysis card targets the
      // just-created check, not a now-stale earlier one.
      queryClient.invalidateQueries({
        queryKey: performanceKeys.latestCheck(websiteId, strategy, pageUrl),
      });
      // Stage 15.5: same reasoning as seo/hooks.ts's useRunSeoCheck -- a
      // harmless no-op refetch if no transition/alert occurred.
      queryClient.invalidateQueries({ queryKey: alertKeys.all(websiteId) });
      // Stage 15.7: same reasoning as seo/hooks.ts -- refresh the global
      // bell/panel immediately rather than waiting for the next poll.
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    runCheck: (strategy: PerformanceStrategy, pageUrl: string) =>
      mutation.mutate({ strategy, pageUrl }),
    isRunning: mutation.isPending,
    error: toErrorMessage(mutation.error, "Failed to run performance test."),
    reset: mutation.reset,
  };
}

interface RunPerformanceAiAnalysisArgs {
  performanceCheckId: string;
}

// Stage 16.4: deliberately does NOT invalidate/cache-write anything --
// Stage 16.3 has no read/history endpoint for AiAnalysis rows, so there is
// nothing else in the cache that could be stale as a result of this call.
// `variables` is exposed (not just `data`) specifically so the consuming
// component can compare "which check was this mutation FOR" against
// "which check is currently selected" -- the context-change/race-condition
// identity safety required by Stage 16.4 §19/§20 is implemented in the
// component, using these raw mutation fields, not inside this hook.
export function useRunPerformanceAiAnalysis(websiteId: string) {
  const mutation = useMutation({
    mutationFn: ({ performanceCheckId }: RunPerformanceAiAnalysisArgs) =>
      runPerformanceAiAnalysis(websiteId, performanceCheckId).then((result) => result.analysis),
  });

  return {
    analyze: (performanceCheckId: string) => mutation.mutate({ performanceCheckId }),
    analysis: mutation.data ?? null,
    requestedCheckId: mutation.variables?.performanceCheckId ?? null,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: toErrorMessage(mutation.error, "AI analysis failed."),
    reset: mutation.reset,
  };
}
