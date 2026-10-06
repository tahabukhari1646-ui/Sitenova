import type { SeoChangeSet, SeoIssue, SeoIssueSeverity } from "./types";

// Pure decision logic: no Prisma, no Express, no HTTP dependency — mirrors
// monitor/alerts.ts's own "take an already-computed input, decide what Alert
// rows fall out of it" discipline exactly. The only input is the EXISTING
// Stage 14.8 SeoChangeSet — this module performs no independent comparison
// of title/meta/H1/canonical/robots/sitemap/structured-data/indexability;
// it only filters and maps newIssues/resolvedIssues that deriveSeoChanges
// already computed.

export type SeoAlertType = "SEO_ISSUE_OPENED" | "SEO_ISSUE_RESOLVED";

// Only WARNING/ERROR SEO issues are alertable — INFO issues remain fully
// visible in SEO analysis/history (issues.ts is never modified to hide
// them) but never produce an Alert. Applied identically to both
// newIssues and resolvedIssues, per Stage 15.2 §3/§9.
const ALERTABLE_SEVERITIES = new Set<SeoIssueSeverity>(["WARNING", "ERROR"]);

function isAlertable(issue: SeoIssue): issue is SeoIssue & { severity: "WARNING" | "ERROR" } {
  return ALERTABLE_SEVERITIES.has(issue.severity);
}

export interface SeoAlertCreateInput {
  websiteId: string;
  seoCheckId: string;
  source: "SEO";
  type: SeoAlertType;
  severity: "WARNING" | "ERROR";
  // Stable domain identity — issue.code verbatim, never transformed,
  // prefixed, or combined with website/check/severity (source/type already
  // provide that context) — per Stage 15.2 §18.
  code: string;
  // Frozen from the already-curated SeoIssue.message only — never
  // recommendation/evidence, never raw fetch/DNS/stack-trace text. See
  // Stage 15.2 §17.
  message: string;
}

// Derives the exact set of SEO Alert rows for one check-to-check
// transition. Baseline (no predecessor) always yields zero alerts, even if
// the first check is full of WARNING/ERROR issues — Stage 15.2 §6:
// onboarding an existing site must not flood the Alert system with every
// pre-existing problem. A persistent issue (present in both previous and
// current) produces neither an opened nor a resolved alert, since
// deriveSeoChanges already excludes it from both newIssues and
// resolvedIssues by construction.
export function deriveSeoAlerts(
  websiteId: string,
  seoCheckId: string,
  changeSet: SeoChangeSet
): SeoAlertCreateInput[] {
  if (changeSet.isBaseline) return [];

  const opened: SeoAlertCreateInput[] = changeSet.newIssues.filter(isAlertable).map((issue) => ({
    websiteId,
    seoCheckId,
    source: "SEO",
    type: "SEO_ISSUE_OPENED",
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
  }));

  // Resolved alerts preserve the RESOLVED issue's own severity (e.g. a
  // resolved ERROR issue produces a severity=ERROR resolved alert) — this
  // describes the importance of the issue whose lifecycle event just
  // occurred, never blanket-downgraded to INFO. Per Stage 15.2 §5.
  const resolved: SeoAlertCreateInput[] = changeSet.resolvedIssues.filter(isAlertable).map((issue) => ({
    websiteId,
    seoCheckId,
    source: "SEO",
    type: "SEO_ISSUE_RESOLVED",
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
  }));

  return [...opened, ...resolved];
}
