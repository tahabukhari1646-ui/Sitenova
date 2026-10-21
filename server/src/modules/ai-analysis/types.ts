// Stage 16.1: provider-independent AI contracts for Performance analysis.
// Stage 18.1: extended with the shared DiagnosisAiOutput contract (bottom of
// this file) for the upcoming SEO/Uptime diagnoses. SEO/Uptime INPUT shapes
// are added in their own stages, alongside their builders.

export { AiAnalysisStatus, AiAnalysisSource } from "../../generated/prisma/client";

import type { PerformanceStrategy } from "../performance/types";
import type { PerformanceRatings } from "../performance/ratings";
import type { PerformanceStats } from "../performance/stats";

// --- Input contract -----------------------------------------------------
//
// Deliberately reuses the EXISTING deterministic types (PerformanceRatings,
// PerformanceStats's own trend shape) rather than re-deriving or duplicating
// them -- per Stage 16.0 §5's explicit requirement, the AI receives already-
// computed facts (including which rating/trend bucket a metric falls into)
// and never recomputes GOOD/NEEDS_IMPROVEMENT/POOR thresholds itself.
//
// Nothing here is user-identifying or website-content-derived: no email,
// no name, no scraped HTML/title/meta text, no raw PSI response, no API
// keys. Every field is a number, a known string enum, or a URL that has
// already passed this codebase's own same-origin page-identity validation
// (utils/pageUrl.ts) before a PerformanceCheck row ever exists.

export interface PerformanceAiMetricSnapshot {
  performanceScore: number | null;
  lab: {
    lcpMs: number | null;
    cls: number | null;
    fcpMs: number | null;
    tbtMs: number | null;
  };
  field: {
    lcpMs: number | null;
    cls: number | null;
    inpMs: number | null;
    ttfbMs: number | null;
  };
  // Reused verbatim from performance/ratings.ts -- the AI is told which
  // bucket each metric already falls into, never asked to judge this itself.
  ratings: PerformanceRatings;
}

export interface PerformanceAiInput {
  pageUrl: string;
  strategy: PerformanceStrategy;
  current: PerformanceAiMetricSnapshot;
  // null only for a genuine baseline (no prior check existed yet for this
  // exact page+strategy) -- mirrors the same isBaseline/previous-is-null
  // convention already used by performance/stats.ts and seo/changes.ts.
  previous: PerformanceAiMetricSnapshot | null;
  // Reused verbatim from performance/stats.ts's PerformanceStats.trend --
  // same nine metric keys, same IMPROVING/REGRESSING/STABLE/UNKNOWN
  // vocabulary, already computed deterministically.
  trend: PerformanceStats["trend"];
}

// --- Output contract ------------------------------------------------------
//
// Shared 4-level urgency vocabulary for both the overall `priority` and each
// finding's own `severity` -- the same scale at two granularities, not two
// independent enums. `confidence` is intentionally a separate, 3-level scale
// (an AI's certainty in its own inference is a different axis than how bad
// the problem would be if true).
//
// The FACT / INFERENCE / RECOMMENDATION split from Stage 16.0 is encoded
// directly in the shape, not left to prose discipline:
//   evidence         -> FACT (must only restate values present in
//                        PerformanceAiInput, never invented numbers)
//   explanation      -> INFERENCE (a hedged, non-confirmed likely cause)
//   recommendations  -> RECOMMENDATION (suggested next steps)

export type AiUrgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AiConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface PerformanceAiFinding {
  title: string;
  severity: AiUrgency;
  evidence: string[];
  explanation: string;
  confidence: AiConfidence;
  recommendations: string[];
}

export interface PerformanceAiOutput {
  summary: string;
  priority: AiUrgency;
  // Deliberately allowed to be an empty array -- a healthy/GOOD check must
  // be representable as "no issues found", never forced to manufacture a
  // finding. See validation.ts for the upper bound.
  findings: PerformanceAiFinding[];
}

// --- Stage 18.1: shared diagnosis output contract (SEO + Uptime) ----------
//
// Same FACT / INFERENCE / RECOMMENDATION shape as PerformanceAiOutput, plus
// `limitations` -- what the stored data cannot confirm (e.g. "no failure
// reason was recorded", "checks run from a single location"). Performance
// keeps its own PerformanceAiOutput/validation.ts unchanged.

export type DiagnosisAiFinding = PerformanceAiFinding;

export interface DiagnosisAiOutput {
  summary: string;
  priority: AiUrgency;
  // May be empty -- a healthy result must never be forced into a finding.
  findings: DiagnosisAiFinding[];
  // May be empty. See diagnosis-validation.ts for bounds.
  limitations: string[];
}

// --- Stage 18.3: SEO AI input contract -------------------------------------
//
// Built ONLY from one stored SeoCheck (+ its immediate same-page
// predecessor) via the existing deterministic engines (toObservation,
// analyzeSeoIssues, deriveSeoChanges) -- no crawl, no fetch.
//
// Deliberately contains NO scraped page text: no title / meta description /
// H1 text, no canonical or final URL, no robots directive strings, no
// robots.txt/sitemap URLs, no structured-data @type names. Only lengths,
// counts, booleans, fixed enums, Sentinel's own templated issue text, and
// stable codes. Scraped text is untrusted (prompt-injection risk) and not
// needed to explain the facts.

export type SeoAiIssueSeverity = "ERROR" | "WARNING" | "INFO";
export type SeoAiDiscoveryStatus = "FOUND" | "NOT_FOUND" | "UNKNOWN";

export interface SeoAiIssue {
  code: string;
  severity: SeoAiIssueSeverity;
  category: string;
  // Sentinel-authored, templated from numbers/fixed words only (issues.ts).
  message: string;
  // Only numeric evidence (counts) is kept; text evidence such as the raw
  // title/meta/canonical URL is always null -- see seo-input-builder.ts.
  evidence: string | null;
  recommendation: string;
}

export interface SeoAiChangedField {
  code: string;
  category: string;
  // Present ONLY when both sides are a number/boolean/null. Text values
  // (title, meta description, H1, canonical, structured-data types) are
  // always omitted -- only the fact that the field changed is kept.
  previous?: number | boolean | null;
  current?: number | boolean | null;
}

export interface SeoAiInput {
  pageUrl: string;
  isBaseline: boolean;
  http: {
    statusCode: number;
    redirected: boolean;
    finalUrlIsHttps: boolean;
    finalUrlSameOrigin: boolean;
  };
  indexability: "INDEXABLE" | "NOT_INDEXABLE" | "UNKNOWN";
  metadata: {
    titleLength: number | null;
    metaDescriptionLength: number | null;
    canonicalPresent: boolean;
    robotsMetaPresent: boolean;
    xRobotsTagPresent: boolean;
  };
  headings: { h1Count: number; h1Length: number | null; h2Count: number; h3Count: number };
  content: { wordCount: number };
  links: { internal: number; external: number };
  images: { total: number; missingAlt: number };
  structuredData: { jsonLdCount: number; invalidCount: number; typeCount: number };
  discovery: { robotsTxt: SeoAiDiscoveryStatus; sitemap: SeoAiDiscoveryStatus };
  // Sentinel's own heuristic thresholds (issues.ts) -- not Google rules.
  thresholds: {
    titleMin: number;
    titleMax: number;
    metaDescriptionMin: number;
    metaDescriptionMax: number;
  };
  issues: SeoAiIssue[];
  // null for a baseline (first check of this page).
  changes: {
    fields: SeoAiChangedField[];
    newIssueCodes: string[];
    resolvedIssueCodes: string[];
  } | null;
}

// --- Stage 18.5: Uptime (incident) AI input contract -----------------------
//
// Built ONLY from stored rows: one Incident plus MonitoringCheck rows found
// by time for the same website (incidents are not linked to checks). Large
// incidents are SUMMARIZED (SQL aggregates + a fixed sample), never listed in
// full. No website URL or name is included -- the AI does not need it.
//
// The monitoring facts are passed explicitly so the AI knows what it CANNOT
// know: failure reasons are not recorded, checks run from one location, and
// any HTTP response (even 5xx) counts as "up".

export interface IncidentAiCheck {
  checkedAt: string;
  success: boolean;
  statusCode: number | null;
  // null when the stored value was negative (a wall-clock jump) -- unknown.
  responseTimeMs: number | null;
  // true when a FAILED check took at least the timeout ceiling (did not
  // respond in time); false for successes and fast failures.
  hitTimeoutCeiling: boolean;
}

export interface IncidentAiCheckRef {
  checkedAt: string;
  statusCode: number | null;
  responseTimeMs: number | null;
}

export interface IncidentAiInput {
  incident: {
    status: "OPEN" | "RESOLVED";
    startedAt: string;
    resolvedAt: string | null;
    // RESOLVED only; null while the incident is still open.
    durationMs: number | null;
    // Latest check inside the incident window, if any.
    observedUntil: string | null;
  };
  monitoring: {
    checkIntervalSeconds: number;
    failureConfirmationThreshold: number;
    requestTimeoutMs: number;
    timeoutCeilingMs: number;
    degradedThresholdMs: number;
    vantagePoints: number;
    failureReasonRecorded: false;
    httpErrorsCountAsUp: true;
  };
  window: {
    totalChecks: number;
    failedChecks: number;
    timeoutFailures: number;
    fastFailures: number;
    failedResponseTimeMs: { min: number; median: number; max: number } | null;
  };
  // First and last checks of the window (at most 20), oldest first.
  sampleChecks: IncidentAiCheck[];
  baseline24h: {
    checks: number;
    successRate: number | null;
    medianResponseTimeMs: number | null;
    slowChecks: number;
    lastSuccessBefore: IncidentAiCheckRef | null;
  };
  recovery: { firstSuccess: IncidentAiCheckRef | null };
  history: { otherIncidentsLast30Days: number };
}
