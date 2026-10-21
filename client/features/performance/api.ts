import { apiFetch } from "@/lib/api-client";
import type {
  PerformanceAiAnalysisResult,
  PerformanceCheckResult,
  PerformanceHistoryRange,
  PerformanceHistoryResult,
  PerformanceLatestAiAnalysisResult,
  PerformanceLatestResult,
  PerformanceStatsResult,
  PerformanceStrategy,
} from "./types";

// Stage P1: `pageUrl` is the committed (not draft/per-keystroke) page URL to
// test — omitted or undefined means "this website's homepage", matching the
// backend's own no-url-supplied default (resolvePageUrl in
// server/src/modules/performance/pageUrl.ts). Always sent as the raw,
// un-normalized string the user committed; the backend is the sole source
// of normalization/validation truth.
export function getPerformanceStats(
  websiteId: string,
  strategy: PerformanceStrategy,
  pageUrl?: string
): Promise<PerformanceStatsResult> {
  const params = new URLSearchParams({ strategy });
  if (pageUrl) params.set("url", pageUrl);
  return apiFetch<PerformanceStatsResult>(
    `/websites/${websiteId}/performance/stats?${params.toString()}`
  );
}

export function getPerformanceHistory(
  websiteId: string,
  strategy: PerformanceStrategy,
  range: PerformanceHistoryRange,
  pageUrl?: string
): Promise<PerformanceHistoryResult> {
  const params = new URLSearchParams({ strategy, range });
  if (pageUrl) params.set("url", pageUrl);
  return apiFetch<PerformanceHistoryResult>(
    `/websites/${websiteId}/performance?${params.toString()}`
  );
}

// PSI runs live against Google and typically takes ~10-45s — the backend is
// the only thing that talks to PageSpeed Insights; this just triggers it.
export function runPerformanceCheck(
  websiteId: string,
  strategy: PerformanceStrategy,
  pageUrl?: string
): Promise<PerformanceCheckResult> {
  return apiFetch<PerformanceCheckResult>(
    `/websites/${websiteId}/performance/check`,
    {
      method: "POST",
      body: JSON.stringify(pageUrl ? { strategy, url: pageUrl } : { strategy }),
    }
  );
}

// Stage 16.4: the one place the frontend learns a real PerformanceCheck id
// (see types.ts's PerformanceLatestResult doc comment) — used solely to
// target the AI analysis endpoint below, never to duplicate what
// usePerformanceStats already displays.
export function getPerformanceLatestCheck(
  websiteId: string,
  strategy: PerformanceStrategy,
  pageUrl?: string
): Promise<PerformanceLatestResult> {
  const params = new URLSearchParams({ strategy });
  if (pageUrl) params.set("url", pageUrl);
  return apiFetch<PerformanceLatestResult>(
    `/websites/${websiteId}/performance/latest?${params.toString()}`
  );
}

// Stage 16.3's manual AI analysis endpoint — no request body: the backend
// derives everything (ownership, metrics, provider selection) from the URL
// params and the authenticated user alone. Never sends userId, provider,
// model, pageUrl, or strategy — the target PerformanceCheck already fully
// identifies all of that server-side.
export function runPerformanceAiAnalysis(
  websiteId: string,
  performanceCheckId: string
): Promise<PerformanceAiAnalysisResult> {
  return apiFetch<PerformanceAiAnalysisResult>(
    `/websites/${websiteId}/performance-checks/${performanceCheckId}/ai-analysis`,
    { method: "POST" }
  );
}

// Stage 18.2: read-only -- the newest stored successful analysis for this
// exact check (manual or automatic), or `analysis: null`. Never triggers a
// new AI analysis.
export function getLatestPerformanceAiAnalysis(
  websiteId: string,
  performanceCheckId: string
): Promise<PerformanceLatestAiAnalysisResult> {
  return apiFetch<PerformanceLatestAiAnalysisResult>(
    `/websites/${websiteId}/performance-checks/${performanceCheckId}/ai-analysis/latest`
  );
}
