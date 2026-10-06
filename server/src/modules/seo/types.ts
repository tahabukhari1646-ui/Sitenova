// Real network behavior for robots.txt/sitemap discovery has THREE outcomes,
// not two: a confirmed HTTP response (found, or a clear 404/410) is
// conclusive; a transport failure (DNS/timeout/blocked destination/too many
// redirects/network error — anything safeFetch throws) is genuinely
// unresolved and must never be collapsed into "not found". Stage 14.2's
// schema (`robotsTxtFound Boolean` / `sitemapFound Boolean`, both required)
// cannot yet losslessly persist this third state — flagged as a SCHEMA
// SEMANTICS BLOCKER in the Stage 14.3 report for Stage 14.5 to resolve
// before persistence is implemented. This type exists so Stage 14.3's own
// in-memory result is never forced to lie about that distinction in the
// meantime.
export type DiscoveryStatus = "FOUND" | "NOT_FOUND" | "UNKNOWN";

export interface DiscoveryResult {
  status: DiscoveryStatus;
  /** Set only when status === "FOUND". */
  url: string | null;
}

export interface SeoStructuredData {
  jsonLdCount: number;
  types: string[];
  invalidCount: number;
}

// HTML-derived fields only — everything a pure function of the parsed
// document (plus the final URL, needed only for link-hostname resolution).
// Deliberately excludes xRobotsTag (an HTTP response header, not part of the
// HTML) and robots.txt/sitemap discovery (separate network operations) —
// those are bundled at the orchestration level in SeoPageObservation below,
// never inside the parser itself.
export interface ParsedSeoPage {
  title: string | null;
  metaDescription: string | null;

  h1Count: number;
  h1Text: string | null;
  h2Count: number;
  h3Count: number;

  canonicalUrl: string | null;

  robotsMeta: string | null;

  internalLinkCount: number;
  externalLinkCount: number;

  imageCount: number;
  imagesMissingAltCount: number;

  wordCount: number;

  structuredData: SeoStructuredData;
}

// The full set of raw observations Stage 14.5's future persistence layer
// will consume — HTML-derived fields plus the network/discovery-derived
// fields that only fetcher.ts (never parser.ts) can produce.
export interface SeoPageObservation extends ParsedSeoPage {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  xRobotsTag: string | null;
  robotsTxt: DiscoveryResult;
  sitemap: DiscoveryResult;
}

// --- Stage 14.4: deterministic issue/rules engine contracts ---
// Deliberately distinct from PerformanceRating's GOOD/NEEDS_IMPROVEMENT/
// POOR/UNKNOWN vocabulary and from monitoring's UP/DOWN/DEGRADED — SEO
// findings are a different kind of judgment (explainable observations, not
// a threshold-graded metric), so they get their own vocabulary rather than
// reusing either.
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
  /** Stable, machine-readable — never derived from display text. */
  code: string;
  severity: SeoIssueSeverity;
  category: SeoIssueCategory;
  message: string;
  recommendation: string;
  /** Optional concrete detail (e.g. "3 of 10 images are missing alt attributes"). */
  evidence?: string;
}

// Sentinel AI's own V1 derived judgment of whether search engines could
// index this exact URL — NOT a guarantee Google (or any engine) will
// actually index it, and NOT persisted. UNKNOWN is retained for structural
// completeness (a future observation shape might genuinely lack enough
// evidence) but is not reachable from today's SeoPageObservation, which
// always has a concrete statusCode and robots/X-Robots-Tag values.
export type SeoIndexability = "INDEXABLE" | "NOT_INDEXABLE" | "UNKNOWN";

export interface SeoAnalysisResult {
  issues: SeoIssue[];
  indexability: SeoIndexability;
}

// --- Stage 14.5: persistence input contract ---
// Exactly the fields service.ts assembles for one SeoCheck row. Discovery
// fields are already mapped to the Stage 14.3A-approved nullable-boolean
// persistence contract (true = FOUND, false = confirmed NOT_FOUND,
// null = UNKNOWN) — never the richer in-memory DiscoveryResult, and UNKNOWN
// must never be mapped to false. `id`/`checkedAt` are left to Prisma's
// defaults, not part of this input.
// --- Stage 14.8: deterministic history change-tracking contracts ---
// Deliberately does NOT include an "ISSUES" category — new/resolved issues
// are represented separately (as full SeoIssue objects, richer than the
// compact SeoChange shape below), not shoehorned into a generic change
// entry.
export type SeoChangeCategory =
  | "STATUS"
  | "INDEXABILITY"
  | "METADATA"
  | "HEADINGS"
  | "DISCOVERY"
  | "IMAGES"
  | "STRUCTURED_DATA";

// Compact and API/frontend-safe by design — every comparable field in this
// module is a string, number, boolean, or null, so this union avoids both
// `unknown` and a sprawling per-field type.
export type SeoChangeValue = string | number | boolean | null;

export interface SeoChange {
  code: string;
  category: SeoChangeCategory;
  label: string;
  previousValue: SeoChangeValue;
  currentValue: SeoChangeValue;
}

export interface SeoChangeSet {
  // true when there was no previous snapshot to compare against (the
  // very first check ever recorded) — changes/newIssues/resolvedIssues are
  // always empty in that case, never fabricated against nonexistent history.
  isBaseline: boolean;
  changes: SeoChange[];
  newIssues: SeoIssue[];
  resolvedIssues: SeoIssue[];
}

export interface SeoCheckCreateData {
  // Stage P2: the resolved, normalized page identity (see schema.prisma's
  // SeoCheck.pageUrl doc comment) — distinct from requestedUrl/finalUrl
  // below, which stay raw/unnormalized/informational.
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

  robotsTxtFound: boolean | null;
  robotsTxtUrl: string | null;

  sitemapFound: boolean | null;
  sitemapUrl: string | null;

  structuredData: SeoStructuredData;
}
