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
