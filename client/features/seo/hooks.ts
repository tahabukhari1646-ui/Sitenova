"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import { alertKeys } from "@/features/alerts/hooks";
import { notificationKeys } from "@/features/notifications/hooks";
import { getSeoHistory, getSeoLatest, runSeoCheck } from "./api";

// Stage P2: `pageUrl` is now part of every key, exactly like Performance's
// own performanceKeys — a homepage SEO query and a /morrisons/ SEO query
// must never share, invalidate, or be confused with each other's cache
// entry.
export const seoKeys = {
  latest: (websiteId: string, pageUrl: string) =>
    ["websites", websiteId, "seo", "latest", pageUrl] as const,
  // Deliberately a separate root from `latest` — a history fetch/invalidation
  // can never affect the latest card and vice versa, matching Performance's
  // stats/history separation.
  history: (websiteId: string, pageUrl: string) =>
    ["websites", websiteId, "seo", "history", pageUrl] as const,
};

function toErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : fallback;
}

export function useSeoLatest(websiteId: string, pageUrl: string) {
  const query = useQuery({
    queryKey: seoKeys.latest(websiteId, pageUrl),
    queryFn: () => getSeoLatest(websiteId, pageUrl),
    enabled: Boolean(websiteId) && Boolean(pageUrl),
  });

  return {
    check: query.data?.check ?? null,
    analysis: query.data?.analysis ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    error: toErrorMessage(query.error, "Failed to load SEO data."),
    refetch: query.refetch,
  };
}

export function useSeoHistory(websiteId: string, pageUrl: string) {
  const query = useQuery({
    queryKey: seoKeys.history(websiteId, pageUrl),
    queryFn: () => getSeoHistory(websiteId, pageUrl),
    enabled: Boolean(websiteId) && Boolean(pageUrl),
  });

  return {
    history: query.data ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    error: toErrorMessage(query.error, "Failed to load SEO history."),
    refetch: query.refetch,
  };
}

// Stage P2: `pageUrl` is passed at call time (not captured from a hook
// argument) so the mutation always runs against whichever page was actually
// selected+committed when the button was clicked, and invalidates only that
// exact page's cache entries on success — a manual subpage check never
// invalidates, refreshes, or is confused with the homepage's own latest/
// history, mirroring Performance's useRunPerformanceCheck exactly.
export function useRunSeoCheck(websiteId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (pageUrl: string) => runSeoCheck(websiteId, pageUrl),
    onSuccess: (_result, pageUrl) => {
      queryClient.invalidateQueries({ queryKey: seoKeys.latest(websiteId, pageUrl) });
      queryClient.invalidateQueries({ queryKey: seoKeys.history(websiteId, pageUrl) });
      // Stage 15.5: a manual SEO check may create a new SEO_ISSUE_OPENED/
      // RESOLVED alert. Invalidating the prefix (not a specific filter
      // combination) refreshes every cached filter variant of this
      // website's Alerts section without this module needing to know the
      // Alerts feature's exact filter shape. If the check created no
      // alert (no transition occurred), this is a harmless no-op refetch.
      queryClient.invalidateQueries({ queryKey: alertKeys.all(websiteId) });
      // Stage 15.7: a new Alert from this check also creates a paired
      // IN_APP Notification (Stage 15.6) for the website's owner. The
      // Notification query is user-scoped, not website-scoped, so there is
      // no per-website key to target -- invalidate the whole prefix so the
      // bell/panel refresh immediately rather than waiting for the next
      // 60s poll. Harmless no-op if this check created no alert.
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    runCheck: (pageUrl: string) => mutation.mutate(pageUrl),
    isRunning: mutation.isPending,
    error: toErrorMessage(mutation.error, "Unable to complete SEO check."),
    reset: mutation.reset,
  };
}
