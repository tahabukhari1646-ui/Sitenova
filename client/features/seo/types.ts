import type { AiAnalysisStatus, AiFinding, AiUrgency } from "@/features/ai/types";

export type SeoIssueSeverity = "ERROR" | "WARNING" | "INFO";

export type SeoIssueCategory =
  | "INDEXABILITY"
  | "CONTENT"
  | "HEADINGS"
  | "METADATA"
  | "LINKS"
  | "IMAGES"
  | "STRUCTURED_DATA"
  | "DISCOVERY"
  | "TECHNICAL";

export interface SeoIssue {
  code: string;
  severity: SeoIssueSeverity;
  category: SeoIssueCategory;
  message: string;
  recommendation: string;
  evidence?: string;
}

// Sentinel AI's own derived judgment — not a guarantee of actual search
// engine indexing behavior.
export type SeoIndexability = "INDEXABLE" | "NOT_INDEXABLE" | "UNKNOWN";

export interface SeoAnalysisResult {
  issues: SeoIssue[];
  indexability: SeoIndexability;
}

export interface SeoStructuredData {
  jsonLdCount: number;
  types: string[];
  invalidCount: number;
}

export interface SeoCheckRecord {
  id: string;
  websiteId: string;

  // Stage P2: the resolved, normalized page identity this check belongs to
  // — distinct from requestedUrl/finalUrl below, which stay raw/
  // unnormalized. This is what "which page does this result belong to" UI
  // should display.
  pageUrl: string;

  requestedUrl: string;
  finalUrl: string;
  statusCode: number;

  title: string | null;
  metaDescription: string | null;

  h1Count: number;
  h1Text: string | null;
  h2Count: number;
  h3Count: number;

  canonicalUrl: string | null;

  robotsMeta: string | null;
  xRobotsTag: string | null;

  internalLinkCount: number;
  externalLinkCount: number;

  imageCount: number;
  imagesMissingAltCount: number;

  wordCount: number;

  // true = confirmed found, false = confirmed not found, null = could not
  // be verified (DNS/timeout/network failure) — null must never be
  // rendered the same as false.
  robotsTxtFound: boolean | null;
  robotsTxtUrl: string | null;

  sitemapFound: boolean | null;
  sitemapUrl: string | null;

  structuredData: SeoStructuredData;

  checkedAt: string;
}

export interface SeoLatestResult {
  check: SeoCheckRecord | null;
  analysis: SeoAnalysisResult | null;
  // Stage P2: the resolved page this result was queried for — present even
  // when check is null (never checked yet), so the empty state can still
  // say which page was queried.
  pageUrl: string;
}

// --- Stage 14.8: deterministic history change tracking ---
export type SeoChangeCategory =
  | "STATUS"
  | "INDEXABILITY"
  | "METADATA"
  | "HEADINGS"
  | "DISCOVERY"
  | "IMAGES"
  | "STRUCTURED_DATA";

export type SeoChangeValue = string | number | boolean | null;

export interface SeoChange {
  code: string;
  category: SeoChangeCategory;
  label: string;
  previousValue: SeoChangeValue;
  currentValue: SeoChangeValue;
}

export interface SeoChangeSet {
  // true for the very first check ever recorded — there was nothing to
  // compare against, so changes/newIssues/resolvedIssues are always empty
  // and must be presented as "Baseline check", never "No changes".
  isBaseline: boolean;
  changes: SeoChange[];
  newIssues: SeoIssue[];
  resolvedIssues: SeoIssue[];
}

// A history row is a raw SeoCheck snapshot PLUS its change set relative to
// its own true chronological predecessor — extends SeoCheckRecord (every
// existing field is still present) rather than replacing it, so this is a
// backward-compatible addition to the Stage 14.6 history contract.
export interface SeoHistoryEntry extends SeoCheckRecord {
  changes: SeoChangeSet;
}

export interface SeoHistoryResult {
  pageUrl: string;
  checks: SeoHistoryEntry[];
  returned: number;
  total: number;
  truncated: boolean;
}

export interface SeoCheckResult {
  check: SeoCheckRecord;
}

// --- Stage 18.4: SEO AI diagnosis (consumes the Stage 18.3 backend
// verbatim -- see server/src/modules/ai-analysis/service.ts's
// SeoAiAnalysisResultDto). Findings reuse Performance's finding shape; the
// output adds `limitations` (what the stored data cannot confirm).
// `inputFingerprint` is omitted: nothing in this UI displays it.

export interface SeoAiOutput {
  summary: string;
  priority: AiUrgency;
  findings: AiFinding[];
  limitations: string[];
}

export interface SeoAiAnalysis {
  id: string;
  seoCheckId: string;
  provider: string;
  model: string;
  status: AiAnalysisStatus;
  output: SeoAiOutput | null;
  createdAt: string;
}

export interface SeoAiAnalysisResult {
  analysis: SeoAiAnalysis;
}

// GET .../ai-analysis/latest -- null when this check has no stored
// successful analysis yet.
export interface SeoLatestAiAnalysisResult {
  analysis: SeoAiAnalysis | null;
}
