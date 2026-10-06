import type { PerformanceAiInput, PerformanceAiOutput, PerformanceAiFinding, AiUrgency } from "../../modules/ai-analysis/types";
import type { PerformanceRating } from "../../modules/performance/ratings";
import type { AiProvider } from "./provider";

// Stage 16.3: a deterministic, zero-network AiProvider implementation so
// the full manual-analysis flow can be developed and tested without an
// OpenAI API key. Implements the EXACT SAME AiProvider interface as
// OpenAiProvider -- the service layer cannot tell them apart.
//
// Pure function of its input only: no Date.now(), no Math.random(), no
// network, no environment reads. The same PerformanceAiInput always
// produces the same PerformanceAiOutput.
//
// Sentinel's own deterministic ratings (performance/ratings.ts) are the
// SOLE trigger for every finding below -- this file never recomputes a
// Core Web Vitals threshold itself, and never flags a metric whose rating
// is GOOD or UNKNOWN. TBT is deliberately never checked: ratings.ts's own
// rateTbt() always returns UNKNOWN by design (no official 3-tier
// threshold exists), so there is never a legitimate rating to trigger on.

interface MetricCheck {
  // Used only to build the evidence string, e.g. "fieldLcpMs".
  metricKey: string;
  label: string;
  rating: PerformanceRating;
  value: number | null;
  previousValue: number | null;
  previousRating: PerformanceRating | null;
  trend: "IMPROVING" | "REGRESSING" | "STABLE" | "UNKNOWN";
  explanation: string;
  recommendations: string[];
}

const SEVERITY_BY_RATING: Partial<Record<PerformanceRating, AiUrgency>> = {
  POOR: "HIGH",
  NEEDS_IMPROVEMENT: "MEDIUM",
};

function buildEvidence(check: MetricCheck): string[] {
  const evidence: string[] = [`${check.metricKey} is ${check.value}ms (rated ${check.rating})`];
  if (check.previousValue !== null && check.previousRating !== null) {
    evidence.push(
      `previous ${check.metricKey} was ${check.previousValue}ms (rated ${check.previousRating}, trend ${check.trend})`
    );
  }
  return evidence;
}

function buildFinding(check: MetricCheck): PerformanceAiFinding | null {
  const severity = SEVERITY_BY_RATING[check.rating];
  if (!severity) return null; // GOOD or UNKNOWN -- not a problem to report

  const ratingLabel = check.rating === "POOR" ? "Poor" : "Needs-Improvement";

  return {
    title: `${ratingLabel} ${check.label}`,
    severity,
    evidence: buildEvidence(check),
    explanation: check.explanation,
    confidence: "MEDIUM",
    recommendations: check.recommendations,
  };
}

// CLS is a unitless shift score, not milliseconds -- its own evidence
// string must not claim an "ms" unit the way every timing metric's does.
function buildClsFinding(check: Omit<MetricCheck, "value" | "previousValue"> & { value: number | null; previousValue: number | null }): PerformanceAiFinding | null {
  const severity = SEVERITY_BY_RATING[check.rating];
  if (!severity) return null;

  const ratingLabel = check.rating === "POOR" ? "Poor" : "Needs-Improvement";
  const evidence = [`${check.metricKey} is ${check.value} (rated ${check.rating})`];
  if (check.previousValue !== null && check.previousRating !== null) {
    evidence.push(`previous ${check.metricKey} was ${check.previousValue} (rated ${check.previousRating}, trend ${check.trend})`);
  }

  return {
    title: `${ratingLabel} ${check.label}`,
    severity,
    evidence,
    explanation: check.explanation,
    confidence: "MEDIUM",
    recommendations: check.recommendations,
  };
}

const URGENCY_RANK: Record<AiUrgency, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "deterministic-v1";

  async analyzePerformance(input: PerformanceAiInput): Promise<PerformanceAiOutput> {
    const { current, previous, trend } = input;
    const findings: PerformanceAiFinding[] = [];

    // LCP: prefer field (real-user CrUX) data; fall back to lab when field
    // is UNKNOWN (commonly missing for lower-traffic sites, per ratings.ts).
    const useFieldLcp = current.ratings.fieldLcpMs !== "UNKNOWN";
    const lcpFinding = buildFinding({
      metricKey: useFieldLcp ? "fieldLcpMs" : "labLcpMs",
      label: "Largest Contentful Paint",
      rating: useFieldLcp ? current.ratings.fieldLcpMs : current.ratings.labLcpMs,
      value: useFieldLcp ? current.field.lcpMs : current.lab.lcpMs,
      previousValue: previous ? (useFieldLcp ? previous.field.lcpMs : previous.lab.lcpMs) : null,
      previousRating: previous ? (useFieldLcp ? previous.ratings.fieldLcpMs : previous.ratings.labLcpMs) : null,
      trend: trend.fieldLcpMs,
      explanation:
        "Slow rendering or loading of the page's main above-the-fold content may be contributing to this. Sentinel does not identify the specific LCP element -- inspect the Lighthouse report to find it.",
      recommendations: [
        "Inspect the LCP element in Lighthouse's full report",
        "Review above-the-fold image/resource optimization (size, format, compression)",
        "Review preload/fetch-priority strategy for critical above-the-fold assets",
      ],
    });
    if (lcpFinding) findings.push(lcpFinding);

    // CLS: same field-preferred, lab-fallback pattern as LCP.
    const useFieldCls = current.ratings.fieldCls !== "UNKNOWN";
    const clsFinding = buildClsFinding({
      metricKey: useFieldCls ? "fieldCls" : "labCls",
      label: "Cumulative Layout Shift",
      rating: useFieldCls ? current.ratings.fieldCls : current.ratings.labCls,
      value: useFieldCls ? current.field.cls : current.lab.cls,
      previousValue: previous ? (useFieldCls ? previous.field.cls : previous.lab.cls) : null,
      previousRating: previous ? (useFieldCls ? previous.ratings.fieldCls : previous.ratings.labCls) : null,
      trend: trend.fieldCls,
      explanation:
        "Visual instability during load (for example, content shifting after images, fonts, or embeds load) may be contributing to this.",
      recommendations: [
        "Identify which elements shift using Lighthouse's layout-shift details",
        "Reserve explicit width/height (or aspect-ratio) for images and embeds",
        "Avoid injecting content above existing content after the initial render",
      ],
    });
    if (clsFinding) findings.push(clsFinding);

    // INP: field-only (no lab equivalent exists in this contract).
    const inpFinding = buildFinding({
      metricKey: "fieldInpMs",
      label: "Interaction to Next Paint",
      rating: current.ratings.fieldInpMs,
      value: current.field.inpMs,
      previousValue: previous?.field.inpMs ?? null,
      previousRating: previous?.ratings.fieldInpMs ?? null,
      trend: trend.fieldInpMs,
      explanation:
        "Slow responsiveness to real user interaction may be contributing to this -- long JavaScript execution on the main thread is a common cause.",
      recommendations: [
        "Profile long JavaScript tasks on the main thread",
        "Break up large synchronous work into smaller chunks",
        "Review third-party scripts for interaction-blocking behavior",
      ],
    });
    if (inpFinding) findings.push(inpFinding);

    // FCP: lab-only (no field equivalent exists in this contract).
    const fcpFinding = buildFinding({
      metricKey: "labFcpMs",
      label: "First Contentful Paint",
      rating: current.ratings.labFcpMs,
      value: current.lab.fcpMs,
      previousValue: previous?.lab.fcpMs ?? null,
      previousRating: previous?.ratings.labFcpMs ?? null,
      trend: trend.labFcpMs,
      explanation:
        "A delay before the first visible content renders may be contributing to this -- render-blocking resources or slow server response are common causes.",
      recommendations: [
        "Review render-blocking CSS/JS in the critical rendering path",
        "Check server/backend response time for the initial document",
        "Consider reducing critical-path resource size",
      ],
    });
    if (fcpFinding) findings.push(fcpFinding);

    // TTFB: field-only (no lab equivalent exists in this contract).
    const ttfbFinding = buildFinding({
      metricKey: "fieldTtfbMs",
      label: "Time to First Byte",
      rating: current.ratings.fieldTtfbMs,
      value: current.field.ttfbMs,
      previousValue: previous?.field.ttfbMs ?? null,
      previousRating: previous?.ratings.fieldTtfbMs ?? null,
      trend: trend.fieldTtfbMs,
      explanation:
        "A slow initial server response may be contributing to this -- server/backend processing time or hosting/network latency are common causes.",
      recommendations: [
        "Investigate backend/server processing time for this request",
        "Review hosting/CDN/network latency to this page's origin",
        "Check for slow database queries or uncached server-side work",
      ],
    });
    if (ttfbFinding) findings.push(ttfbFinding);

    // TBT is deliberately never checked -- ratings.ts's rateTbt() always
    // returns UNKNOWN (no official 3-tier threshold exists), so there is
    // never a legitimate rating to trigger a finding from.

    if (findings.length === 0) {
      return {
        summary: "No significant performance problems were found in this check.",
        priority: "LOW",
        findings: [],
      };
    }

    const overallPriority = findings.reduce<AiUrgency>(
      (worst, f) => (URGENCY_RANK[f.severity] > URGENCY_RANK[worst] ? f.severity : worst),
      "LOW"
    );

    return {
      summary: `Found ${findings.length} performance issue${findings.length === 1 ? "" : "s"} in this check (highest priority: ${overallPriority}).`,
      priority: overallPriority,
      findings,
    };
  }
}
