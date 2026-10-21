import { toObservation } from "../seo/service";
import {
  analyzeSeoIssues,
  META_DESCRIPTION_MAX_LENGTH,
  META_DESCRIPTION_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from "../seo/issues";
import { deriveSeoChanges } from "../seo/changes";
import type { SeoIssue } from "../seo/types";
import type { SeoAiChangedField, SeoAiInput, SeoAiIssue } from "./types";
import type { SeoCheck } from "../../generated/prisma/client";

// Stage 18.3: the ONE place a stored SeoCheck becomes the provider-
// independent SeoAiInput. Mirrors input-builder.ts's Performance discipline:
// reuses the EXISTING deterministic SEO engines unchanged (toObservation ->
// analyzeSeoIssues / deriveSeoChanges) and never re-derives a rule itself.
//
// Untrusted scraped page text is never copied into the output -- only its
// length, presence, or a count. See SeoAiInput's own doc comment for the
// full exclusion list.

const SEVERITY_ORDER: Record<SeoIssue["severity"], number> = { ERROR: 0, WARNING: 1, INFO: 2 };

function sortIssues<T extends { severity: SeoIssue["severity"]; code: string }>(issues: T[]): T[] {
  return [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code)
  );
}

// SeoIssue.message is always Sentinel-templated (numbers/fixed words), but
// SeoIssue.evidence is NOT: for TITLE_TOO_SHORT/LONG it is the raw page
// title, for META_DESCRIPTION_TOO_SHORT/LONG the raw meta description, and
// for CANONICAL_MALFORMED/CANONICAL_MISMATCH a raw canonical URL (see
// seo/issues.ts). So evidence is passed through ONLY for this allowlist of
// codes whose evidence is purely numeric; every other code -- including any
// future one -- gets null (default deny).
const NUMERIC_EVIDENCE_CODES = new Set(["H1_MULTIPLE", "IMAGES_MISSING_ALT", "STRUCTURED_DATA_INVALID"]);

function toAiIssue(issue: SeoIssue): SeoAiIssue {
  return {
    code: issue.code,
    severity: issue.severity,
    category: issue.category,
    message: issue.message,
    evidence: NUMERIC_EVIDENCE_CODES.has(issue.code) ? (issue.evidence ?? null) : null,
    recommendation: issue.recommendation,
  };
}

function isNonText(value: unknown): value is number | boolean | null {
  return value === null || typeof value === "number" || typeof value === "boolean";
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// `check` is the exact SeoCheck being analyzed; `predecessor` must already be
// its immediate same-(websiteId, pageUrl) predecessor
// (seoRepository.findImmediatePredecessor), or null for a baseline.
export function buildSeoAiInput(check: SeoCheck, predecessor: SeoCheck | null): SeoAiInput {
  const observation = toObservation(check);
  const analysis = analyzeSeoIssues(observation);
  const changeSet = deriveSeoChanges(predecessor ? toObservation(predecessor) : null, observation);

  const finalUrl = safeUrl(observation.finalUrl);
  const pageUrl = safeUrl(check.pageUrl);

  const fields: SeoAiChangedField[] = changeSet.changes
    .map((change) => {
      const field: SeoAiChangedField = { code: change.code, category: change.category };
      // Keep before/after ONLY when both are non-text; any string value
      // (title, meta, H1, canonical, structured-data types...) is dropped.
      if (isNonText(change.previousValue) && isNonText(change.currentValue)) {
        field.previous = change.previousValue;
        field.current = change.currentValue;
      }
      return field;
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    pageUrl: check.pageUrl,
    isBaseline: changeSet.isBaseline,
    http: {
      statusCode: observation.statusCode,
      redirected: observation.finalUrl !== observation.requestedUrl,
      finalUrlIsHttps: finalUrl?.protocol === "https:",
      finalUrlSameOrigin: finalUrl !== null && pageUrl !== null && finalUrl.origin === pageUrl.origin,
    },
    indexability: analysis.indexability,
    metadata: {
      titleLength: observation.title === null ? null : observation.title.length,
      metaDescriptionLength:
        observation.metaDescription === null ? null : observation.metaDescription.length,
      canonicalPresent: observation.canonicalUrl !== null,
      robotsMetaPresent: observation.robotsMeta !== null,
      xRobotsTagPresent: observation.xRobotsTag !== null,
    },
    headings: {
      h1Count: observation.h1Count,
      h1Length: observation.h1Text === null ? null : observation.h1Text.length,
      h2Count: observation.h2Count,
      h3Count: observation.h3Count,
    },
    content: { wordCount: observation.wordCount },
    links: { internal: observation.internalLinkCount, external: observation.externalLinkCount },
    images: { total: observation.imageCount, missingAlt: observation.imagesMissingAltCount },
    structuredData: {
      jsonLdCount: observation.structuredData.jsonLdCount,
      invalidCount: observation.structuredData.invalidCount,
      typeCount: observation.structuredData.types.length,
    },
    discovery: { robotsTxt: observation.robotsTxt.status, sitemap: observation.sitemap.status },
    thresholds: {
      titleMin: TITLE_MIN_LENGTH,
      titleMax: TITLE_MAX_LENGTH,
      metaDescriptionMin: META_DESCRIPTION_MIN_LENGTH,
      metaDescriptionMax: META_DESCRIPTION_MAX_LENGTH,
    },
    issues: sortIssues(analysis.issues).map(toAiIssue),
    changes: changeSet.isBaseline
      ? null
      : {
          fields,
          newIssueCodes: changeSet.newIssues.map((i) => i.code).sort(),
          resolvedIssueCodes: changeSet.resolvedIssues.map((i) => i.code).sort(),
        },
  };
}
