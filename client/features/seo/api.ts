import { apiFetch } from "@/lib/api-client";
import type { SeoCheckResult, SeoHistoryResult, SeoLatestResult } from "./types";

// Stage P2: `pageUrl` is the committed (not draft/per-keystroke) page URL to
// read/check — omitted or undefined means "this website's homepage",
// matching the backend's own no-url-supplied default (resolvePageUrl in
// server/src/utils/pageUrl.ts) and mirroring Performance's own api.ts
// pattern exactly, so both modules share identical request semantics.
export function getSeoLatest(websiteId: string, pageUrl?: string): Promise<SeoLatestResult> {
  const params = new URLSearchParams();
  if (pageUrl) params.set("url", pageUrl);
  const query = params.toString();
  return apiFetch<SeoLatestResult>(`/websites/${websiteId}/seo/latest${query ? `?${query}` : ""}`);
}

export function getSeoHistory(websiteId: string, pageUrl?: string): Promise<SeoHistoryResult> {
  const params = new URLSearchParams();
  if (pageUrl) params.set("url", pageUrl);
  const query = params.toString();
  return apiFetch<SeoHistoryResult>(`/websites/${websiteId}/seo${query ? `?${query}` : ""}`);
}

export function runSeoCheck(websiteId: string, pageUrl?: string): Promise<SeoCheckResult> {
  return apiFetch<SeoCheckResult>(`/websites/${websiteId}/seo/check`, {
    method: "POST",
    body: JSON.stringify(pageUrl ? { url: pageUrl } : {}),
  });
}
