import type {
  DiscoveryResult,
  SeoAnalysisResult,
  SeoIndexability,
  SeoIssue,
  SeoIssueSeverity,
  SeoPageObservation,
} from "./types";

// Pure and side-effect-free by design (mirrors performance/ratings.ts's own
// discipline) — no Prisma, no safeFetch, no network, no env vars, no
// timestamps in the output. Operates only on an already-collected
// SeoPageObservation and always returns the same result for the same input.

// --- Sentinel AI V1 heuristic thresholds ---
// Unlike Stage 13.5's Core Web Vitals thresholds (verified against one
// official web.dev source), NO single authoritative numeric standard exists
// for title/meta-description length — search engines truncate by rendered
// pixel width in the search results page, not raw character count, so any
// character-count threshold is inherently an approximation. These specific
// numbers are widely-cited industry approximations (Moz/Yoast/Ahrefs-style
// guidance), chosen as reasonable V1 defaults — Sentinel AI's own heuristic,
// not a Google requirement or guarantee.
export const TITLE_MIN_LENGTH = 30;
export const TITLE_MAX_LENGTH = 60;
export const META_DESCRIPTION_MIN_LENGTH = 70;
export const META_DESCRIPTION_MAX_LENGTH = 160;

// Deliberately NOT implemented in V1 (see Stage 14.4 report):
// - a word-count/"thin content" rule — page-type-dependent (a contact page
//   is legitimately short), no threshold here would avoid being noisy for a
//   large fraction of real pages.
// - a "zero JSON-LD" finding — the large majority of real pages have none,
//   so flagging it would be near-universal, non-differentiating noise.

const SEVERITY_ORDER: Record<SeoIssueSeverity, number> = {
  ERROR: 0,
  WARNING: 1,
  INFO: 2,
};

function parseRobotsDirectives(value: string | null): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(/[,\s]+/)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token.length > 0)
  );
}

// --- TECHNICAL ---

function checkHttpStatus(statusCode: number): SeoIssue | null {
  if (statusCode >= 200 && statusCode < 300) return null;

  if (statusCode === 404 || statusCode === 410) {
    return {
      code: "STATUS_NOT_FOUND",
      severity: "ERROR",
      category: "TECHNICAL",
      message: `The page returned HTTP ${statusCode}, meaning it does not exist at this URL.`,
      recommendation: "Restore the page, or update links/redirects to point to a valid URL.",
    };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return {
      code: "STATUS_CLIENT_ERROR",
      severity: "ERROR",
      category: "TECHNICAL",
      message: `The page returned HTTP ${statusCode}, a client error.`,
      recommendation: "Investigate why this request is being rejected and fix the underlying cause.",
    };
  }

  if (statusCode >= 500 && statusCode < 600) {
    return {
      code: "STATUS_SERVER_ERROR",
      severity: "ERROR",
      category: "TECHNICAL",
      message: `The page returned HTTP ${statusCode}, a server error.`,
      recommendation: "Investigate the server-side failure — this page could not be served correctly.",
    };
  }

  if (statusCode >= 300 && statusCode < 400) {
    return {
      code: "STATUS_REDIRECT_UNRESOLVED",
      severity: "WARNING",
      category: "TECHNICAL",
      message: `The final response was HTTP ${statusCode} (a redirect status) with no further location to follow.`,
      recommendation: "Confirm this redirect is configured correctly and points somewhere valid.",
    };
  }

  return null;
}

function checkHttps(requestedUrl: string, finalUrl: string): SeoIssue | null {
  let requestedScheme: string;
  let finalScheme: string;
  try {
    requestedScheme = new URL(requestedUrl).protocol;
    finalScheme = new URL(finalUrl).protocol;
  } catch {
    return null;
  }

  if (finalScheme !== "http:") return null; // healthy — https, no issue/noise

  if (requestedScheme === "https:") {
    return {
      code: "HTTPS_DOWNGRADE_REDIRECT",
      severity: "WARNING",
      category: "TECHNICAL",
      message: "The page was requested over HTTPS but the final response was served over plain HTTP.",
      recommendation: "Investigate why this redirect chain downgrades to HTTP and fix it to stay on HTTPS.",
    };
  }

  return {
    code: "FINAL_URL_NOT_SECURE",
    severity: "WARNING",
    category: "TECHNICAL",
    message: "The page is served over plain HTTP rather than HTTPS.",
    recommendation: "Serve this page over HTTPS.",
  };
}

// --- METADATA ---

function checkTitle(title: string | null): SeoIssue[] {
  if (title === null) {
    return [
      {
        code: "TITLE_MISSING",
        severity: "ERROR",
        category: "METADATA",
        message: "The page has no <title> element (or it is empty).",
        recommendation: "Add a unique, descriptive <title> for this page.",
      },
    ];
  }

  if (title.length < TITLE_MIN_LENGTH) {
    return [
      {
        code: "TITLE_TOO_SHORT",
        severity: "WARNING",
        category: "METADATA",
        message: `The title is ${title.length} characters, shorter than Sentinel AI's recommended minimum of ${TITLE_MIN_LENGTH}.`,
        recommendation: "Consider a more descriptive title — this is a Sentinel AI heuristic, not a Google requirement.",
        evidence: title,
      },
    ];
  }

  if (title.length > TITLE_MAX_LENGTH) {
    return [
      {
        code: "TITLE_TOO_LONG",
        severity: "WARNING",
        category: "METADATA",
        message: `The title is ${title.length} characters, longer than Sentinel AI's recommended maximum of ${TITLE_MAX_LENGTH}.`,
        recommendation: "Consider shortening the title — search engines truncate long titles by display width, not this exact character count.",
        evidence: title,
      },
    ];
  }

  return [];
}

function checkMetaDescription(metaDescription: string | null): SeoIssue[] {
  if (metaDescription === null) {
    return [
      {
        code: "META_DESCRIPTION_MISSING",
        severity: "WARNING",
        category: "METADATA",
        message: "The page has no meta description.",
        recommendation: "Add a concise meta description summarizing this page's content.",
      },
    ];
  }

  if (metaDescription.length < META_DESCRIPTION_MIN_LENGTH) {
    return [
      {
        code: "META_DESCRIPTION_TOO_SHORT",
        severity: "WARNING",
        category: "METADATA",
        message: `The meta description is ${metaDescription.length} characters, shorter than Sentinel AI's recommended minimum of ${META_DESCRIPTION_MIN_LENGTH}.`,
        recommendation: "Consider a more complete description — this is a Sentinel AI heuristic, not a ranking guarantee.",
        evidence: metaDescription,
      },
    ];
  }

  if (metaDescription.length > META_DESCRIPTION_MAX_LENGTH) {
    return [
      {
        code: "META_DESCRIPTION_TOO_LONG",
        severity: "WARNING",
        category: "METADATA",
        message: `The meta description is ${metaDescription.length} characters, longer than Sentinel AI's recommended maximum of ${META_DESCRIPTION_MAX_LENGTH}.`,
        recommendation: "Consider shortening the description — search engines truncate by display width, not this exact character count.",
        evidence: metaDescription,
      },
    ];
  }

  return [];
}

function checkCanonical(canonicalUrl: string | null, finalUrl: string): SeoIssue | null {
  if (canonicalUrl === null) {
    return {
      code: "CANONICAL_MISSING",
      severity: "INFO",
      category: "METADATA",
      message: "The page has no <link rel=\"canonical\"> tag.",
      recommendation: "A canonical tag is often unnecessary for a single-URL page, but consider adding one if this content is reachable via multiple URLs.",
    };
  }

  let resolved: URL;
  try {
    resolved = new URL(canonicalUrl, finalUrl);
  } catch {
    return {
      code: "CANONICAL_MALFORMED",
      severity: "WARNING",
      category: "METADATA",
      message: "The canonical URL could not be resolved to a valid URL.",
      recommendation: "Fix the canonical tag to point to a valid absolute or relative URL.",
      evidence: canonicalUrl,
    };
  }

  // Conservative, exact comparison — no trailing-slash/query normalization,
  // per the explicit instruction not to over-normalize meaningful
  // differences. A cross-page canonical is frequently intentional, so this
  // is INFO, never an automatic ERROR.
  if (resolved.href !== finalUrl) {
    return {
      code: "CANONICAL_MISMATCH",
      severity: "INFO",
      category: "METADATA",
      message: "The canonical URL points to a different URL than this page's final address.",
      recommendation: "Confirm this is intentional (e.g. this page is a variant of the canonical page) rather than a misconfiguration.",
      evidence: resolved.href,
    };
  }

  return null;
}

// --- HEADINGS ---

function checkHeadings(h1Count: number): SeoIssue | null {
  if (h1Count === 0) {
    return {
      code: "H1_MISSING",
      severity: "WARNING",
      category: "HEADINGS",
      message: "The page has no <h1> element.",
      recommendation: "Add a single, descriptive <h1> that reflects the page's main topic.",
    };
  }

  if (h1Count > 1) {
    return {
      code: "H1_MULTIPLE",
      severity: "WARNING",
      category: "HEADINGS",
      message: `The page has ${h1Count} <h1> elements.`,
      recommendation: "Consider using a single <h1> for the page's main heading, with additional headings as <h2>/<h3> for document hierarchy clarity.",
      evidence: String(h1Count),
    };
  }

  return null;
}

// --- INDEXABILITY ---

function checkRobotsDirectives(robotsMeta: string | null, xRobotsTag: string | null): SeoIssue[] {
  const metaDirectives = parseRobotsDirectives(robotsMeta);
  const headerDirectives = parseRobotsDirectives(xRobotsTag);
  const issues: SeoIssue[] = [];

  const noindexSources = [
    metaDirectives.has("noindex") ? "meta robots" : null,
    headerDirectives.has("noindex") ? "X-Robots-Tag" : null,
  ].filter((s): s is string => s !== null);

  if (noindexSources.length > 0) {
    issues.push({
      code: "NOINDEX_DIRECTIVE",
      severity: "WARNING",
      category: "INDEXABILITY",
      message: `This page instructs search engines not to index it (noindex found in ${noindexSources.join(" and ")}).`,
      recommendation: "Confirm this is intentional — if not, remove the noindex directive.",
    });
  }

  const nofollowSources = [
    metaDirectives.has("nofollow") ? "meta robots" : null,
    headerDirectives.has("nofollow") ? "X-Robots-Tag" : null,
  ].filter((s): s is string => s !== null);

  if (nofollowSources.length > 0) {
    issues.push({
      code: "NOFOLLOW_DIRECTIVE",
      severity: "INFO",
      category: "INDEXABILITY",
      message: `This page instructs search engines not to follow its links (nofollow found in ${nofollowSources.join(" and ")}).`,
      recommendation: "Confirm this is intentional.",
    });
  }

  return issues;
}

function deriveIndexability(observation: SeoPageObservation): SeoIndexability {
  if (observation.statusCode < 200 || observation.statusCode >= 300) {
    return "NOT_INDEXABLE";
  }

  const metaDirectives = parseRobotsDirectives(observation.robotsMeta);
  const headerDirectives = parseRobotsDirectives(observation.xRobotsTag);
  if (metaDirectives.has("noindex") || headerDirectives.has("noindex")) {
    return "NOT_INDEXABLE";
  }

  return "INDEXABLE";
}

// --- LINKS ---

function checkInternalLinks(internalLinkCount: number): SeoIssue | null {
  if (internalLinkCount === 0) {
    return {
      code: "NO_INTERNAL_LINKS",
      severity: "INFO",
      category: "LINKS",
      message: "No internal links were found on this page.",
      recommendation: "Consider linking to other relevant pages on this site to support navigation and content discovery.",
    };
  }
  return null;
}

// --- IMAGES ---

function checkImageAlt(imageCount: number, imagesMissingAltCount: number): SeoIssue | null {
  if (imagesMissingAltCount > 0) {
    return {
      code: "IMAGES_MISSING_ALT",
      severity: "WARNING",
      category: "IMAGES",
      message: "Some images are missing an alt attribute.",
      recommendation: "Add descriptive alt text to images that convey meaningful content; decorative images may use alt=\"\" intentionally.",
      evidence: `${imagesMissingAltCount} of ${imageCount} images are missing alt attributes`,
    };
  }
  return null;
}

// --- STRUCTURED_DATA ---

function checkStructuredData(
  jsonLdCount: number,
  types: string[],
  invalidCount: number
): SeoIssue[] {
  const issues: SeoIssue[] = [];

  if (invalidCount > 0) {
    issues.push({
      code: "STRUCTURED_DATA_INVALID",
      severity: "WARNING",
      category: "STRUCTURED_DATA",
      message: `${invalidCount} JSON-LD block(s) on this page could not be parsed as valid JSON.`,
      recommendation: "Fix the malformed JSON-LD so search engines can read this structured data.",
      evidence: String(invalidCount),
    });
  }

  // Deliberately no finding for jsonLdCount === 0 — see the module comment
  // at the top of this file.
  if (jsonLdCount > 0 && types.length === 0 && invalidCount === 0) {
    issues.push({
      code: "STRUCTURED_DATA_NO_TYPE",
      severity: "INFO",
      category: "STRUCTURED_DATA",
      message: "JSON-LD is present but no @type could be detected.",
      recommendation: "Confirm the structured data declares a recognizable Schema.org @type.",
    });
  }

  return issues;
}

// --- DISCOVERY (robots.txt / sitemap) ---

function checkDiscovery(
  result: DiscoveryResult,
  kind: "robots.txt" | "sitemap"
): SeoIssue | null {
  if (result.status === "FOUND") return null;

  if (result.status === "UNKNOWN") {
    return {
      code: kind === "robots.txt" ? "ROBOTS_TXT_UNKNOWN" : "SITEMAP_UNKNOWN",
      severity: "INFO",
      category: "DISCOVERY",
      message: `Sentinel AI could not verify whether ${kind} is available (the check was inconclusive).`,
      recommendation: "Retry later — this does not confirm the file is missing.",
    };
  }

  // NOT_FOUND: robots.txt absence is extremely common and low-impact, so
  // it's INFO; a sitemap is more actionable to add, so it's WARNING — a
  // deliberate policy distinction, not an oversight.
  if (kind === "robots.txt") {
    return {
      code: "ROBOTS_TXT_NOT_FOUND",
      severity: "INFO",
      category: "DISCOVERY",
      message: "No robots.txt was found at the expected location.",
      recommendation: "A robots.txt file is optional but can help control crawler access if needed.",
    };
  }

  return {
    code: "SITEMAP_NOT_FOUND",
    severity: "WARNING",
    category: "DISCOVERY",
    message: "No sitemap was found (neither declared in robots.txt nor at the conventional /sitemap.xml location).",
    recommendation: "Consider adding a sitemap to help search engines discover this site's pages.",
  };
}

function sortIssues(issues: SeoIssue[]): SeoIssue[] {
  return [...issues].sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.code.localeCompare(b.code);
  });
}

export function analyzeSeoIssues(observation: SeoPageObservation): SeoAnalysisResult {
  const issues: SeoIssue[] = [];

  const statusIssue = checkHttpStatus(observation.statusCode);
  if (statusIssue) issues.push(statusIssue);

  const httpsIssue = checkHttps(observation.requestedUrl, observation.finalUrl);
  if (httpsIssue) issues.push(httpsIssue);

  issues.push(...checkTitle(observation.title));
  issues.push(...checkMetaDescription(observation.metaDescription));

  const canonicalIssue = checkCanonical(observation.canonicalUrl, observation.finalUrl);
  if (canonicalIssue) issues.push(canonicalIssue);

  const headingIssue = checkHeadings(observation.h1Count);
  if (headingIssue) issues.push(headingIssue);

  issues.push(...checkRobotsDirectives(observation.robotsMeta, observation.xRobotsTag));

  const linkIssue = checkInternalLinks(observation.internalLinkCount);
  if (linkIssue) issues.push(linkIssue);

  const imageIssue = checkImageAlt(observation.imageCount, observation.imagesMissingAltCount);
  if (imageIssue) issues.push(imageIssue);

  issues.push(
    ...checkStructuredData(
      observation.structuredData.jsonLdCount,
      observation.structuredData.types,
      observation.structuredData.invalidCount
    )
  );

  const robotsTxtIssue = checkDiscovery(observation.robotsTxt, "robots.txt");
  if (robotsTxtIssue) issues.push(robotsTxtIssue);

  const sitemapIssue = checkDiscovery(observation.sitemap, "sitemap");
  if (sitemapIssue) issues.push(sitemapIssue);

  return {
    issues: sortIssues(issues),
    indexability: deriveIndexability(observation),
  };
}
