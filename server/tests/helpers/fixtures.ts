// Stage 19.1: plain test data with no database access, shared by the unit
// tests (in-memory objects) and the factories (database rows).
import type { PerformanceCheck, SeoCheck } from "../../src/generated/prisma/client";

export const PAGE = "https://site.example.invalid/";
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// A check that triggers no SEO issues at all; overrides create specific
// problems (e.g. { title: null } -> TITLE_MISSING, an ERROR).
export const HEALTHY_SEO = {
  title: "A perfectly reasonable page title for SEO tests",
  metaDescription:
    "A meta description long enough to satisfy the Sentinel AI minimum length heuristic for checks.",
  h1Count: 1,
  h1Text: "Heading",
  h2Count: 2,
  h3Count: 1,
  canonicalUrl: PAGE,
  robotsMeta: null,
  xRobotsTag: null,
  internalLinkCount: 5,
  externalLinkCount: 1,
  imageCount: 2,
  imagesMissingAltCount: 0,
  wordCount: 400,
  robotsTxtFound: true,
  robotsTxtUrl: `${PAGE}robots.txt`,
  sitemapFound: true,
  sitemapUrl: `${PAGE}sitemap.xml`,
  structuredData: { jsonLdCount: 0, types: [], invalidCount: 0 },
};

export function seoCheckObject(id: string, checkedAt: Date, overrides: Partial<SeoCheck> = {}): SeoCheck {
  return {
    id,
    websiteId: "website-1",
    pageUrl: PAGE,
    requestedUrl: PAGE,
    finalUrl: PAGE,
    statusCode: 200,
    checkedAt,
    ...HEALTHY_SEO,
    ...overrides,
  } as SeoCheck;
}

export function performanceMetrics(good: boolean) {
  return {
    fieldLcpMs: good ? 1000 : 6000,
    fieldInpMs: good ? 100 : 800,
    fieldCls: good ? 0.01 : 0.5,
    performanceScore: good ? 95 : 30,
  };
}

export function performanceCheckObject(id: string, good: boolean, checkedAt: Date): PerformanceCheck {
  return {
    id,
    websiteId: "website-1",
    pageUrl: PAGE,
    strategy: "MOBILE",
    labLcpMs: null,
    labCls: null,
    labFcpMs: null,
    labTbtMs: null,
    fieldTtfbMs: null,
    checkedAt,
    ...performanceMetrics(good),
  };
}

export const VALID_PERFORMANCE_OUTPUT = (summary = "Stored summary") => ({
  summary,
  priority: "LOW",
  findings: [] as unknown[],
});

export const VALID_DIAGNOSIS_OUTPUT = (summary = "Stored summary") => ({
  ...VALID_PERFORMANCE_OUTPUT(summary),
  limitations: ["Based only on stored data."],
});

export const VALID_FINDING = {
  title: "Slow largest contentful paint",
  severity: "HIGH",
  evidence: ["Field LCP is 6000 ms"],
  explanation: "The main content takes too long to appear.",
  confidence: "MEDIUM",
  recommendations: ["Compress the hero image"],
};
