import type { PerformanceMetrics } from "./stats";

export type PerformanceRating = "GOOD" | "NEEDS_IMPROVEMENT" | "POOR" | "UNKNOWN";

// All thresholds below were verified against current official documentation
// during Stage 13.5 implementation (not assumed/copied from a prompt):
//   LCP:  https://web.dev/articles/lcp   (Core Web Vital)
//   INP:  https://web.dev/articles/inp   (Core Web Vital)
//   CLS:  https://web.dev/articles/cls   (Core Web Vital)
//   FCP:  https://web.dev/articles/fcp   (diagnostic — NOT a Core Web Vital)
//   TTFB: https://web.dev/articles/ttfb  (diagnostic — NOT a Core Web Vital)
//   Lighthouse score bands: https://developer.chrome.com/docs/lighthouse/performance/performance-scoring
//
// TBT has no official GOOD/NEEDS_IMPROVEMENT/POOR table — it isn't part of
// CrUX/Core Web Vitals, and web.dev's own TBT article gives only a single
// "aim for under 200ms" guideline, not a 3-tier threshold. rateTbt() always
// returns UNKNOWN rather than inventing a boundary.
export const LCP_THRESHOLDS_MS = { good: 2500, needsImprovementMax: 4000 };
export const INP_THRESHOLDS_MS = { good: 200, needsImprovementMax: 500 };
export const CLS_THRESHOLDS = { good: 0.1, needsImprovementMax: 0.25 };
export const FCP_THRESHOLDS_MS = { good: 1800, needsImprovementMax: 3000 };
export const TTFB_THRESHOLDS_MS = { good: 800, needsImprovementMax: 1800 };
export const PERFORMANCE_SCORE_THRESHOLDS = { goodMin: 90, needsImprovementMin: 50 };

// Inclusive upper bounds throughout — no ambiguous < vs <= mixing:
// value <= good -> GOOD; value <= needsImprovementMax -> NEEDS_IMPROVEMENT;
// otherwise POOR. null always -> UNKNOWN (never POOR, never an error —
// most commonly means insufficient CrUX field data for lower-traffic sites).
function rateAgainstThresholds(
  value: number | null,
  good: number,
  needsImprovementMax: number
): PerformanceRating {
  if (value === null) return "UNKNOWN";
  if (value <= good) return "GOOD";
  if (value <= needsImprovementMax) return "NEEDS_IMPROVEMENT";
  return "POOR";
}

// Same official threshold applies whether LCP/CLS were measured in the lab
// or the field — the metric's quality bar doesn't change by source, only
// the rating's real-world meaning does (lab = synthetic, field = real users).
export function rateLcp(value: number | null): PerformanceRating {
  return rateAgainstThresholds(value, LCP_THRESHOLDS_MS.good, LCP_THRESHOLDS_MS.needsImprovementMax);
}

export function rateInp(value: number | null): PerformanceRating {
  return rateAgainstThresholds(value, INP_THRESHOLDS_MS.good, INP_THRESHOLDS_MS.needsImprovementMax);
}

export function rateCls(value: number | null): PerformanceRating {
  return rateAgainstThresholds(value, CLS_THRESHOLDS.good, CLS_THRESHOLDS.needsImprovementMax);
}

// Diagnostic metric, not a Core Web Vital — see module comment.
export function rateFcp(value: number | null): PerformanceRating {
  return rateAgainstThresholds(value, FCP_THRESHOLDS_MS.good, FCP_THRESHOLDS_MS.needsImprovementMax);
}

// Diagnostic metric, not a Core Web Vital — see module comment.
export function rateTtfb(value: number | null): PerformanceRating {
  return rateAgainstThresholds(value, TTFB_THRESHOLDS_MS.good, TTFB_THRESHOLDS_MS.needsImprovementMax);
}

// No official 3-tier threshold exists for TBT (see module comment) —
// deliberately always UNKNOWN rather than an invented boundary.
export function rateTbt(_value: number | null): PerformanceRating {
  return "UNKNOWN";
}

export function ratePerformanceScore(value: number | null): PerformanceRating {
  if (value === null) return "UNKNOWN";
  if (value >= PERFORMANCE_SCORE_THRESHOLDS.goodMin) return "GOOD";
  if (value >= PERFORMANCE_SCORE_THRESHOLDS.needsImprovementMin) return "NEEDS_IMPROVEMENT";
  return "POOR";
}

// Sentinel AI's own derived v1 summary — NOT a reproduction of Google's
// official CrUX origin/page pass/fail assessment. Based only on the three
// field Core Web Vitals (fieldLcpMs, fieldInpMs, fieldCls); performanceScore,
// FCP, TBT, TTFB, and lab metrics are intentionally excluded.
export function rateCoreWebVitals(
  fieldLcpMs: number | null,
  fieldInpMs: number | null,
  fieldCls: number | null
): PerformanceRating {
  const allPresent = fieldLcpMs !== null && fieldInpMs !== null && fieldCls !== null;
  const ratings = [rateLcp(fieldLcpMs), rateInp(fieldInpMs), rateCls(fieldCls)];

  if (allPresent && ratings.every((r) => r === "GOOD")) {
    return "GOOD";
  }

  if (ratings.some((r) => r === "POOR")) {
    return "POOR";
  }

  if (allPresent && ratings.some((r) => r === "NEEDS_IMPROVEMENT")) {
    return "NEEDS_IMPROVEMENT";
  }

  return "UNKNOWN";
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

const ALL_UNKNOWN_RATINGS: PerformanceRatings = {
  performanceScore: "UNKNOWN",
  labLcpMs: "UNKNOWN",
  labCls: "UNKNOWN",
  labFcpMs: "UNKNOWN",
  labTbtMs: "UNKNOWN",
  fieldLcpMs: "UNKNOWN",
  fieldCls: "UNKNOWN",
  fieldInpMs: "UNKNOWN",
  fieldTtfbMs: "UNKNOWN",
  coreWebVitals: "UNKNOWN",
};

// Rates a single set of metrics (intended to be the LATEST check only — see
// Stage 13.5 scope: averages/trend deltas are not rated).
export function ratePerformanceMetrics(
  metrics: PerformanceMetrics | null
): PerformanceRatings {
  if (!metrics) {
    return { ...ALL_UNKNOWN_RATINGS };
  }

  return {
    performanceScore: ratePerformanceScore(metrics.performanceScore),
    labLcpMs: rateLcp(metrics.labLcpMs),
    labCls: rateCls(metrics.labCls),
    labFcpMs: rateFcp(metrics.labFcpMs),
    labTbtMs: rateTbt(metrics.labTbtMs),
    fieldLcpMs: rateLcp(metrics.fieldLcpMs),
    fieldCls: rateCls(metrics.fieldCls),
    fieldInpMs: rateInp(metrics.fieldInpMs),
    fieldTtfbMs: rateTtfb(metrics.fieldTtfbMs),
    coreWebVitals: rateCoreWebVitals(metrics.fieldLcpMs, metrics.fieldInpMs, metrics.fieldCls),
  };
}
