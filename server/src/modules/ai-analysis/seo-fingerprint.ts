import { createHash } from "node:crypto";
import type { SeoAiInput } from "./types";

// Stage 18.3: deterministic fingerprint of a SeoAiInput -- same discipline as
// fingerprint.ts (Performance): a pure function of MEASURED input only (no
// provider/model/timestamps), every object rebuilt with a fixed key order,
// arrays sorted, so field or issue ordering can never change the result.

function canonicalize(input: SeoAiInput): unknown {
  return {
    pageUrl: input.pageUrl,
    isBaseline: input.isBaseline,
    http: {
      statusCode: input.http.statusCode,
      redirected: input.http.redirected,
      finalUrlIsHttps: input.http.finalUrlIsHttps,
      finalUrlSameOrigin: input.http.finalUrlSameOrigin,
    },
    indexability: input.indexability,
    metadata: {
      titleLength: input.metadata.titleLength,
      metaDescriptionLength: input.metadata.metaDescriptionLength,
      canonicalPresent: input.metadata.canonicalPresent,
      robotsMetaPresent: input.metadata.robotsMetaPresent,
      xRobotsTagPresent: input.metadata.xRobotsTagPresent,
    },
    headings: {
      h1Count: input.headings.h1Count,
      h1Length: input.headings.h1Length,
      h2Count: input.headings.h2Count,
      h3Count: input.headings.h3Count,
    },
    content: { wordCount: input.content.wordCount },
    links: { internal: input.links.internal, external: input.links.external },
    images: { total: input.images.total, missingAlt: input.images.missingAlt },
    structuredData: {
      jsonLdCount: input.structuredData.jsonLdCount,
      invalidCount: input.structuredData.invalidCount,
      typeCount: input.structuredData.typeCount,
    },
    discovery: { robotsTxt: input.discovery.robotsTxt, sitemap: input.discovery.sitemap },
    thresholds: {
      titleMin: input.thresholds.titleMin,
      titleMax: input.thresholds.titleMax,
      metaDescriptionMin: input.thresholds.metaDescriptionMin,
      metaDescriptionMax: input.thresholds.metaDescriptionMax,
    },
    issues: [...input.issues]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((i) => ({
        code: i.code,
        severity: i.severity,
        category: i.category,
        message: i.message,
        evidence: i.evidence,
        recommendation: i.recommendation,
      })),
    changes:
      input.changes === null
        ? null
        : {
            fields: [...input.changes.fields]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((f) => ({
                code: f.code,
                category: f.category,
                previous: f.previous === undefined ? "omitted" : f.previous,
                current: f.current === undefined ? "omitted" : f.current,
              })),
            newIssueCodes: [...input.changes.newIssueCodes].sort(),
            resolvedIssueCodes: [...input.changes.resolvedIssueCodes].sort(),
          },
  };
}

export function computeSeoAiInputFingerprint(input: SeoAiInput): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(input))).digest("hex");
}
