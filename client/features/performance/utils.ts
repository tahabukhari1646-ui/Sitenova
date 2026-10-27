import type {
  PerformanceMetricValues,
  PerformanceRating,
  PerformanceTrend,
} from "./types";

const CLS_METRIC_KEYS = new Set<keyof PerformanceMetricValues>([
  "labCls",
  "fieldCls",
]);

// Milliseconds display as seconds once >=1000ms for readability (e.g. LCP),
// matching how PageSpeed Insights itself presents timing metrics.
export function formatMs(value: number | null): string {
  if (value === null) return "Unavailable";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export function formatCls(value: number | null): string {
  if (value === null) return "Unavailable";
  return value.toFixed(2);
}

export function formatScore(value: number | null): string {
  if (value === null) return "—";
  return String(Math.round(value));
}

function withSign(value: number, formatted: string): string {
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatSignedMs(value: number): string {
  return withSign(value, `${Math.round(value)} ms`);
}

export function formatSignedCls(value: number): string {
  return withSign(value, value.toFixed(2));
}

export function formatSignedScore(value: number): string {
  return withSign(value, String(Math.round(value)));
}

// The backend already rounds `changes` per-metric (stats.ts) — this only
// picks the right unit per metric, it never reinterprets sign or direction.
export function formatSignedChange(
  key: keyof PerformanceMetricValues,
  value: number
): string {
  if (key === "performanceScore") return formatSignedScore(value);
  if (CLS_METRIC_KEYS.has(key)) return formatSignedCls(value);
  return formatSignedMs(value);
}

export const RATING_BADGE_STATUS: Record<
  PerformanceRating,
  "healthy" | "warning" | "critical" | "inactive"
> = {
  GOOD: "healthy",
  NEEDS_IMPROVEMENT: "warning",
  POOR: "critical",
  UNKNOWN: "inactive",
};

export const RATING_LABEL: Record<PerformanceRating, string> = {
  GOOD: "Good",
  NEEDS_IMPROVEMENT: "Needs Improvement",
  POOR: "Poor",
  UNKNOWN: "Unknown",
};

export const TREND_LABEL: Record<PerformanceTrend, string> = {
  IMPROVING: "Improving",
  REGRESSING: "Regressing",
  STABLE: "Stable",
  // Distinct from RATING_LABEL.UNKNOWN ("Unknown") — a trend can only be
  // UNKNOWN because the latest-vs-previous comparison lacks one of its two
  // data points, not because a rating is missing. Backend value stays
  // UNKNOWN; only this trend-specific display label changes.
  UNKNOWN: "No comparison data",
};

export const METRIC_LABEL: Record<keyof PerformanceMetricValues, string> = {
  performanceScore: "Performance Score",
  labLcpMs: "Lab LCP",
  labCls: "Lab CLS",
  labFcpMs: "FCP",
  labTbtMs: "TBT",
  fieldLcpMs: "Field LCP",
  fieldCls: "Field CLS",
  fieldInpMs: "INP",
  fieldTtfbMs: "TTFB",
};

// Compact label for chart axes/tooltips — full precision lives in
// formatFullTimestamp for the accessible summary/recent-tests list.
export function formatChartTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

// Stage 18.9: the AI label/format helpers now live in features/ai/utils.ts;
// re-exported here so existing imports from this file keep working.
export {
  CONFIDENCE_LABEL,
  URGENCY_BADGE_STATUS,
  URGENCY_LABEL,
  formatAiTimestamp,
} from "@/features/ai/utils";

export const METRIC_ORDER: (keyof PerformanceMetricValues)[] = [
  "performanceScore",
  "labLcpMs",
  "labCls",
  "labFcpMs",
  "labTbtMs",
  "fieldLcpMs",
  "fieldInpMs",
  "fieldCls",
  "fieldTtfbMs",
];
