import type {
  AiConfidence,
  AiUrgency,
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

// Stage 16.4: mirrors RATING_BADGE_STATUS's exact pattern. Only LOW maps to
// "healthy" (green) and only CRITICAL maps to "critical" (red) -- MEDIUM
// and HIGH both render as "warning" (amber), since StatusBadge has no
// fifth tier and escalating HIGH straight to red would read as more
// alarming than a professional severity presentation calls for (Stage
// 16.4 §13). The text label always shows the real word regardless, so
// meaning is never carried by color alone (§22).
export const URGENCY_BADGE_STATUS: Record<
  AiUrgency,
  "healthy" | "warning" | "critical" | "inactive"
> = {
  LOW: "healthy",
  MEDIUM: "warning",
  HIGH: "warning",
  CRITICAL: "critical",
};

export const URGENCY_LABEL: Record<AiUrgency, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

// Confidence is a different axis from urgency (how sure the AI is, not how
// bad the problem would be) -- deliberately never rendered with the
// healthy/warning/critical palette, since a LOW-confidence finding isn't
// itself a problem the way a POOR rating or CRITICAL priority is.
export const CONFIDENCE_LABEL: Record<AiConfidence, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export function formatAiTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

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
