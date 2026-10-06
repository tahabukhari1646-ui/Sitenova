"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import {
  getSettings,
  updateAccountSettings,
  updateAppearanceSettings,
  updateNotificationSettings,
} from "./api";
import type { UpdateAccountInput, UpdateAppearanceInput, UpdateNotificationsInput } from "./types";

export const settingsKeys = {
  all: ["settings"] as const,
};

function toErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : fallback;
}

export function useSettings() {
  const query = useQuery({
    queryKey: settingsKeys.all,
    queryFn: () => getSettings().then((result) => result.settings),
  });

  return {
    settings: query.data ?? null,
    isLoading: query.isPending,
    isError: query.isError,
    error: toErrorMessage(query.error, "Failed to load settings."),
    refetch: query.refetch,
  };
}

// Writes the server's confirmed response straight into the query cache on
// success -- no optimistic update, so a rejected mutation leaves the cache
// (and therefore the displayed value) exactly as it was before the attempt
// (Stage 16.8 §28: "no optimistic lie if backend rejects update").
export function useUpdateAccountSettings() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: UpdateAccountInput) => updateAccountSettings(input),
    onSuccess: (result) => {
      queryClient.setQueryData(settingsKeys.all, result.settings);
    },
  });

  return {
    updateAccount: (input: UpdateAccountInput) => mutation.mutateAsync(input),
    isPending: mutation.isPending,
    error: toErrorMessage(mutation.error, "Failed to save account settings."),
    reset: mutation.reset,
  };
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: UpdateNotificationsInput) => updateNotificationSettings(input),
    onSuccess: (result) => {
      queryClient.setQueryData(settingsKeys.all, result.settings);
    },
  });

  return {
    updateNotifications: (input: UpdateNotificationsInput) => mutation.mutateAsync(input),
    isPending: mutation.isPending,
    error: toErrorMessage(mutation.error, "Failed to save notification settings."),
  };
}

export function useUpdateAppearanceSettings() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: UpdateAppearanceInput) => updateAppearanceSettings(input),
    onSuccess: (result) => {
      queryClient.setQueryData(settingsKeys.all, result.settings);
    },
  });

  return {
    updateAppearance: (input: UpdateAppearanceInput) => mutation.mutateAsync(input),
    isPending: mutation.isPending,
    error: toErrorMessage(mutation.error, "Failed to save appearance settings."),
  };
}
