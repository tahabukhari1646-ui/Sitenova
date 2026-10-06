"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import { getWebsite, getWebsites } from "./api";

export const websitesKeys = {
  all: ["websites"] as const,
  detail: (id: string) => ["websites", id] as const,
};

function toErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : fallback;
}

export function useWebsites() {
  const query = useQuery({
    queryKey: websitesKeys.all,
    queryFn: () => getWebsites().then((result) => result.websites),
  });

  return {
    websites: query.data ?? [],
    isLoading: query.isPending,
    error: toErrorMessage(query.error, "Failed to load websites."),
    refetch: query.refetch,
  };
}

export function useWebsite(id: string) {
  const query = useQuery({
    queryKey: websitesKeys.detail(id),
    queryFn: () => getWebsite(id).then((result) => result.website),
    enabled: Boolean(id),
  });

  return {
    website: query.data ?? null,
    isLoading: query.isPending,
    error: toErrorMessage(query.error, "Failed to load website."),
    refetch: query.refetch,
  };
}
