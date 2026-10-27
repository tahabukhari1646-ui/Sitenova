export type PerformanceStrategy = "MOBILE" | "DESKTOP";

export type PerformanceRating =
  | "GOOD"
  | "NEEDS_IMPROVEMENT"
  | "POOR"
  | "UNKNOWN";

export type PerformanceTrend =
  | "IMPROVING"
  | "REGRESSING"
  | "STABLE"
  | "UNKNOWN";

export interface PerformanceMetricValues {
  performanceScore: number | null;
  labLcpMs: number | null;
  labCls: number | null;
  labFcpMs: number | null;
  labTbtMs: number | null;
  fieldLcpMs: number | null;
  fieldCls: number | null;
  fieldInpMs: number | null;
  fieldTtfbMs: number | null;
}

export interface PerformanceCheckMetrics extends PerformanceMetricValues {
  checkedAt: string;
}

export interface PerformanceRatings {
  performanceScore: PerformanceRating;
  labLcpMs: PerformanceRating;
  labCls: PerformanceRating;
  labFcpMs: PerformanceRating;
  labTbtMs: PerformanceRating;
  fieldLcpMs: PerformanceRating;
  fieldCls: PerformanceRating;
  fieldInpMs: PerformanceRating;
  fieldTtfbMs: PerformanceRating;
  coreWebVitals: PerformanceRating;
}

export type PerformanceTrendMap = Record<
  keyof PerformanceMetricValues,
  PerformanceTrend
>;

export interface PerformanceStats {
  strategy: PerformanceStrategy;
  // Stage P1: the exact page this sample was computed for — the homepage
  // (Website.url, canonicalized) unless a specific page URL was requested.
  pageUrl: string;
  sampleSize: number;
  latest: PerformanceCheckMetrics | null;
  previous: PerformanceCheckMetrics | null;
  averages: PerformanceMetricValues;
  changes: PerformanceMetricValues;
  trend: PerformanceTrendMap;
  ratings: PerformanceRatings;
}

export interface PerformanceStatsResult {
  stats: PerformanceStats;
}

export interface PerformanceCheckRecord extends PerformanceMetricValues {
  id: string;
  websiteId: string;
  strategy: PerformanceStrategy;
  checkedAt: string;
}

export interface PerformanceCheckResult {
  check: PerformanceCheckRecord;
}

export type PerformanceHistoryRange = "24h" | "7d" | "30d";

export interface PerformanceHistoryEntry extends PerformanceCheckRecord {
  ratings: PerformanceRatings;
}

export interface PerformanceHistoryResult {
  strategy: PerformanceStrategy;
  range: PerformanceHistoryRange;
  pageUrl: string;
  checks: PerformanceHistoryEntry[];
  returned: number;
  total: number;
  truncated: boolean;
}

// Stage 16.4: GET /:id/performance/latest's actual response -- the backend
// endpoint already existed (Stage P1) but had no frontend consumer until
// now. Unlike PerformanceStats.latest (PerformanceCheckMetrics, no `id`),
// this returns the raw PerformanceCheckRecord, which DOES have `id` --
// this is the one and only place the frontend learns a real
// PerformanceCheck's id, needed to target Stage 16.3's AI analysis
// endpoint. No backend change was needed or made for this.
export interface PerformanceLatestResult {
  check: PerformanceCheckRecord | null;
  pageUrl: string;
}

// --- Stage 16.4: Performance AI Analysis (consumes the existing Stage
// 16.3 backend verbatim -- see server/src/modules/ai-analysis/types.ts
// and service.ts's AiAnalysisResultDto). Mirrors the backend contract
// field-for-field; `inputFingerprint` is deliberately omitted here since
// nothing in this UI needs to display it.

// Stage 18.9: the shared AI types now live in features/ai/types.ts; these
// re-exports keep every existing import from this file working unchanged.
import type { AiAnalysisStatus, AiAnalysisTrigger, AiFinding, AiUrgency } from "@/features/ai/types";
export type { AiAnalysisStatus, AiAnalysisTrigger, AiConfidence, AiUrgency } from "@/features/ai/types";
export type PerformanceAiFinding = AiFinding;

export interface PerformanceAiOutput {
  summary: string;
  priority: AiUrgency;
  findings: PerformanceAiFinding[];
}

export interface PerformanceAiAnalysis {
  id: string;
  performanceCheckId: string;
  provider: string;
  model: string;
  status: AiAnalysisStatus;
  output: PerformanceAiOutput | null;
  createdAt: string;
  // Stage 18.9: who created it -- a user's click or the scheduler.
  trigger: AiAnalysisTrigger;
}

export interface PerformanceAiAnalysisResult {
  analysis: PerformanceAiAnalysis;
}

// Stage 18.2: GET .../ai-analysis/latest -- same analysis shape as the POST,
// or null when the check has no stored successful analysis yet.
export interface PerformanceLatestAiAnalysisResult {
  analysis: PerformanceAiAnalysis | null;
}
