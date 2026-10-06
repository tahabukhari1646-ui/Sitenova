import type { PerformanceStrategy } from "./types";

export type TrendDirection = "IMPROVING" | "REGRESSING" | "STABLE" | "UNKNOWN";

const METRIC_KEYS = [
  "performanceScore",
  "labLcpMs",
  "labCls",
  "labFcpMs",
  "labTbtMs",
  "fieldLcpMs",
  "fieldCls",
  "fieldInpMs",
  "fieldTtfbMs",
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

// The only metric where a larger number is a better result — every other
// metric here is a timing (ms) or shift (CLS) value where smaller is better.
const HIGHER_IS_BETTER: ReadonlySet<MetricKey> = new Set(["performanceScore"]);

// CLS values are small decimals (e.g. 0.0004) — rounding to whole numbers or
// even 2 decimal places would destroy real signal. Every other metric here
// is either already a whole millisecond value or a 0-100 score.
const CLS_KEYS: ReadonlySet<MetricKey> = new Set(["labCls", "fieldCls"]);

export interface PerformanceMetrics {
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

// Deliberately structural rather than importing the generated Prisma type —
// keeps this file free of any Prisma dependency, per the "pure, independently
// testable" requirement.
export interface PerformanceCheckLike extends PerformanceMetrics {
  checkedAt: Date;
}

export interface PerformanceStats {
  strategy: PerformanceStrategy;
  sampleSize: number;
  latest: (PerformanceMetrics & { checkedAt: Date }) | null;
  previous: (PerformanceMetrics & { checkedAt: Date }) | null;
  averages: PerformanceMetrics;
  changes: PerformanceMetrics;
  trend: Record<MetricKey, TrendDirection>;
}

function roundMetric(key: MetricKey, value: number | null): number | null {
  if (value === null) return null;
  return CLS_KEYS.has(key) ? Math.round(value * 10000) / 10000 : Math.round(value);
}

// Ignores nulls entirely rather than treating them as zero — a metric with
// values [180, null, 220] averages to 200, not 133.
function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

function computeTrend(
  key: MetricKey,
  latest: number | null,
  previous: number | null
): TrendDirection {
  if (latest === null || previous === null) return "UNKNOWN";
  if (latest === previous) return "STABLE";
  const improved = HIGHER_IS_BETTER.has(key) ? latest > previous : latest < previous;
  return improved ? "IMPROVING" : "REGRESSING";
}

function extractMetrics(check: PerformanceCheckLike): PerformanceMetrics {
  return {
    performanceScore: check.performanceScore,
    labLcpMs: check.labLcpMs,
    labCls: check.labCls,
    labFcpMs: check.labFcpMs,
    labTbtMs: check.labTbtMs,
    fieldLcpMs: check.fieldLcpMs,
    fieldCls: check.fieldCls,
    fieldInpMs: check.fieldInpMs,
    fieldTtfbMs: check.fieldTtfbMs,
  };
}

// Pure: no Prisma, no Express, no HTTP, no PageSpeed API knowledge. `checks`
// must already be strategy-filtered, bounded, and ordered checkedAt DESC by
// the caller — this function only computes over what it's given.
export function computePerformanceStats(
  strategy: PerformanceStrategy,
  checks: PerformanceCheckLike[]
): PerformanceStats {
  const latestCheck = checks[0] ?? null;
  const previousCheck = checks[1] ?? null;

  const latestMetrics = latestCheck ? extractMetrics(latestCheck) : null;
  const previousMetrics = previousCheck ? extractMetrics(previousCheck) : null;

  const averages = {} as PerformanceMetrics;
  const changes = {} as PerformanceMetrics;
  const trend = {} as Record<MetricKey, TrendDirection>;

  for (const key of METRIC_KEYS) {
    averages[key] = roundMetric(key, average(checks.map((c) => c[key])));

    const latestValue = latestMetrics ? latestMetrics[key] : null;
    const previousValue = previousMetrics ? previousMetrics[key] : null;

    changes[key] =
      latestValue !== null && previousValue !== null
        ? roundMetric(key, latestValue - previousValue)
        : null;

    trend[key] = computeTrend(key, latestValue, previousValue);
  }

  return {
    strategy,
    sampleSize: checks.length,
    latest:
      latestMetrics && latestCheck
        ? { ...latestMetrics, checkedAt: latestCheck.checkedAt }
        : null,
    previous:
      previousMetrics && previousCheck
        ? { ...previousMetrics, checkedAt: previousCheck.checkedAt }
        : null,
    averages,
    changes,
    trend,
  };
}
