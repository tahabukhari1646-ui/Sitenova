import { apiFetch } from "@/lib/api-client";
import type {
  SeoAiAnalysisResult,
  SeoCheckResult,
  SeoHistoryResult,
  SeoLatestAiAnalysisResult,
  SeoLatestResult,
} from "./types";

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

// Stage 18.4: manual AI diagnosis of one stored SEO check -- no request body;
// the backend derives everything from the URL params and the authenticated
// user (never sends userId, provider, pageUrl, or page text).
export function runSeoAiAnalysis(
  websiteId: string,
  seoCheckId: string
): Promise<SeoAiAnalysisResult> {
  return apiFetch<SeoAiAnalysisResult>(
    `/websites/${websiteId}/seo-checks/${seoCheckId}/ai-analysis`,
    { method: "POST" }
  );
}

// Stage 18.4: read-only -- the newest stored successful diagnosis for this
// exact check, or `analysis: null`. Never triggers a new analysis.
export function getLatestSeoAiAnalysis(
  websiteId: string,
  seoCheckId: string
): Promise<SeoLatestAiAnalysisResult> {
  return apiFetch<SeoLatestAiAnalysisResult>(
    `/websites/${websiteId}/seo-checks/${seoCheckId}/ai-analysis/latest`
  );
}
