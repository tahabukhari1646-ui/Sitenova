"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "./api";
import type { NotificationStatusFilter } from "./types";

export const notificationKeys = {
  // Prefix -- invalidating this refreshes every status variant at once
  // (Stage 15.7 §24/§25/§26), whether or not that variant is currently
  // mounted/observed (React Query marks inactive matches stale for their
  // next use rather than refetching them in the background for nobody).
  all: ["notifications"] as const,
  list: (status: NotificationStatusFilter) => ["notifications", status] as const,
};

function toErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : fallback;
}

// Notifications can be created by backend schedulers while the dashboard
// stays open, so a fetch-once bell would go stale -- 60s matches the
// stage's own recommended starting point; normal React Query
// refetch-on-window-focus stays enabled (not disabled anywhere in this
// app's QueryClient defaults), so switching back to the tab also refreshes
// sooner than the interval when relevant.
const REFRESH_INTERVAL_MS = 60_000;

// User-scoped, not website-scoped -- deliberately no websiteId anywhere in
// this key, so the same cached state is shared globally across the
// authenticated app (Stage 15.7 §6).
export function useNotifications(status: NotificationStatusFilter) {
  const query = useQuery({
    queryKey: notificationKeys.list(status),
    queryFn: () => getNotifications(status),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  return {
    notifications: query.data?.notifications ?? [],
    total: query.data?.total ?? 0,
    unread: query.data?.unread ?? 0,
    truncated: query.data?.truncated ?? false,
    isLoading: query.isPending,
    isError: query.isError,
    error: toErrorMessage(query.error, "Failed to load notifications."),
    refetch: query.refetch,
  };
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    // Invalidate-only, matching this codebase's existing mutation
    // convention (useRunSeoCheck/useRunPerformanceCheck do the same,
    // no optimistic updates anywhere) -- correctness over instant
    // animation, per Stage 15.7 §27.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    markRead: (id: string) => mutation.mutateAsync(id),
    isMarking: mutation.isPending,
  };
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  return {
    markAllRead: () => mutation.mutateAsync(),
    isMarkingAll: mutation.isPending,
  };
}
