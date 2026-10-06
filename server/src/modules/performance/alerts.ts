import type { PerformanceRating } from "./ratings";
import type { PerformanceStrategy } from "./types";

// Pure decision logic: no Prisma, no PageSpeed integration, no Express, no
// React — mirrors seo/alerts.ts's exact discipline. The only input is the
// already-derived Stage 13.5 `coreWebVitals` rating (rateCoreWebVitals) for
// the previous and current check — no LCP/CLS/INP/FCP/TBT/TTFB/
// performanceScore value or threshold is read or duplicated here, and lab
// metrics never factor in (coreWebVitals is field-data-only by its own
// existing definition).

export type PerformanceAlertType = "PERFORMANCE_DEGRADED" | "PERFORMANCE_RECOVERED";

// Order is for transition CLASSIFICATION only (worse vs. better), never
// persisted or exposed — UNKNOWN is deliberately excluded from this table
// since any transition touching UNKNOWN is rejected before this is
// consulted (see derivePerformanceAlert below). Exported (Stage 16.5) so
// performance/degradation.ts's AI-trigger classification shares the exact
// same worse/better ordering rather than redefining it — both are
// different CONSUMERS of one canonical ordering, not two competing
// definitions of degradation.
export const RATING_ORDER: Record<"GOOD" | "NEEDS_IMPROVEMENT" | "POOR", number> = {
  GOOD: 0,
  NEEDS_IMPROVEMENT: 1,
  POOR: 2,
};

const STRATEGY_CODE: Record<PerformanceStrategy, string> = {
  MOBILE: "MOBILE_CORE_WEB_VITALS",
  DESKTOP: "DESKTOP_CORE_WEB_VITALS",
};

const STRATEGY_LABEL: Record<PerformanceStrategy, string> = {
  MOBILE: "Mobile",
  DESKTOP: "Desktop",
};

const RATING_LABEL: Record<PerformanceRating, string> = {
  GOOD: "Good",
  NEEDS_IMPROVEMENT: "Needs Improvement",
  POOR: "Poor",
  UNKNOWN: "Unknown",
};

// Severity describes the state the transition REACHED, not a delta
// magnitude (Stage 15.3 §10) — exhaustive switches rather than a lookup
// table + cast, so an unreachable rating (GOOD for a degradation, POOR for
// a recovery — impossible by construction once isDegradation is known)
// fails safe to "no alert" instead of an unsafe type assertion.
function degradedSeverity(currentRating: PerformanceRating): "WARNING" | "ERROR" | null {
  switch (currentRating) {
    case "NEEDS_IMPROVEMENT":
      return "WARNING";
    case "POOR":
      return "ERROR";
    default:
      return null;
  }
}

function recoveredSeverity(currentRating: PerformanceRating): "WARNING" | "INFO" | null {
  switch (currentRating) {
    case "NEEDS_IMPROVEMENT":
      return "WARNING";
    case "GOOD":
      return "INFO";
    default:
      return null;
  }
}

export interface PerformanceAlertCreateInput {
  websiteId: string;
  performanceCheckId: string;
  source: "PERFORMANCE";
  type: PerformanceAlertType;
  severity: "INFO" | "WARNING" | "ERROR";
  // Strategy-specific stable identity — exactly MOBILE_CORE_WEB_VITALS or
  // DESKTOP_CORE_WEB_VITALS, never combined with rating/websiteId/checkId/
  // timestamp/numeric metrics (source/type/performanceCheckId already
  // provide that context). Per Stage 15.3 §9.
  code: string;
  // Short, deterministic, curated display text only — never raw PSI
  // response data, API keys, errors, stack traces, credentials, or
  // resolved IPs. Identity comes from code/type/performanceCheckId, never
  // this string. Per Stage 15.3 §11.
  message: string;
}

// A single PerformanceCheck normally produces AT MOST ONE Performance
// Alert, since alerting is on the single aggregate coreWebVitals rating,
// not per-metric. Returns null for: baseline (no predecessor), any
// transition touching UNKNOWN on either side (missing/insufficient CrUX
// field data must never be interpreted as degradation or recovery), and an
// unchanged rating.
// Stage P1: short, safe page context for the alert message — the pathname
// only (e.g. "/services/seo/"), never the full URL with scheme/host/query
// (per Stage P1 §22's explicit "do not expose enormous URLs as primary
// message text"). The homepage (root path "/") is the implicit default
// everywhere else in this app, so it gets no extra context at all, keeping
// existing homepage alert messages byte-identical to before this stage.
function pageContextLabel(pageUrl: string): string {
  let pathname: string;
  try {
    pathname = new URL(pageUrl).pathname;
  } catch {
    return "";
  }
  return pathname === "/" ? "" : ` for ${pathname}`;
}

export function derivePerformanceAlert(
  websiteId: string,
  performanceCheckId: string,
  pageUrl: string,
  strategy: PerformanceStrategy,
  previousRating: PerformanceRating | null,
  currentRating: PerformanceRating
): PerformanceAlertCreateInput | null {
  if (previousRating === null) return null;
  if (previousRating === "UNKNOWN" || currentRating === "UNKNOWN") return null;
  if (previousRating === currentRating) return null;

  const isDegradation = RATING_ORDER[currentRating] > RATING_ORDER[previousRating];
  const code = STRATEGY_CODE[strategy];
  const label = STRATEGY_LABEL[strategy];
  const pageContext = pageContextLabel(pageUrl);

  if (isDegradation) {
    const severity = degradedSeverity(currentRating);
    if (!severity) return null; // unreachable by construction; fails safe
    return {
      websiteId,
      performanceCheckId,
      source: "PERFORMANCE",
      type: "PERFORMANCE_DEGRADED",
      severity,
      code,
      message: `${label} Core Web Vitals degraded${pageContext} from ${RATING_LABEL[previousRating]} to ${RATING_LABEL[currentRating]}.`,
    };
  }

  const severity = recoveredSeverity(currentRating);
  if (!severity) return null; // unreachable by construction; fails safe
  return {
    websiteId,
    performanceCheckId,
    source: "PERFORMANCE",
    type: "PERFORMANCE_RECOVERED",
    severity,
    code,
    message: `${label} Core Web Vitals recovered${pageContext} from ${RATING_LABEL[previousRating]} to ${RATING_LABEL[currentRating]}.`,
  };
}
