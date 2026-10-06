import { safeFetch, SafeFetchError, type SafeFetchResult } from "../../utils/safeFetch";
import type { DiscoveryResult } from "./types";

// The ONLY content types the SEO page fetch will accept — a disallowed
// content type (JSON, PDF, images, other binary) is a controlled safeFetch
// failure (DISALLOWED_CONTENT_TYPE), never something this module attempts
// to parse as HTML.
const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

// Every network operation in this module goes through safeFetch — no raw
// fetch() is introduced here, and none of safeFetch's SSRF/DNS/redirect/
// timeout/body-size/TLS protections are duplicated or weakened. See
// Stage 14.1's report for that implementation; this file only calls it.

export async function fetchSeoPage(url: string): Promise<SafeFetchResult> {
  return safeFetch(url, { allowedContentTypes: HTML_CONTENT_TYPES });
}

function extractSitemapDirectives(robotsTxtBody: string): string[] {
  const directives: string[] = [];
  for (const line of robotsTxtBody.split(/\r?\n/)) {
    const match = /^\s*sitemap\s*:\s*(.+?)\s*$/i.exec(line);
    if (match) directives.push(match[1]);
  }
  return directives;
}

// Shared FOUND/NOT_FOUND/UNKNOWN classification for a single discovery
// probe. A confirmed 2xx is FOUND; a confirmed 404/410 is NOT_FOUND; any
// other status (403, 500, an unexpected redirect target, etc.) or any
// thrown SafeFetchError (DNS failure, timeout, blocked destination, too
// many redirects, network failure) is UNKNOWN — never silently treated as
// NOT_FOUND, per the Stage 14.3 schema-semantics checkpoint.
async function probe(url: string): Promise<{ discovery: DiscoveryResult; body: string | null }> {
  try {
    const result = await safeFetch(url);
    if (result.statusCode >= 200 && result.statusCode < 300) {
      return { discovery: { status: "FOUND", url: result.finalUrl }, body: result.body };
    }
    if (result.statusCode === 404 || result.statusCode === 410) {
      return { discovery: { status: "NOT_FOUND", url: null }, body: null };
    }
    return { discovery: { status: "UNKNOWN", url: null }, body: null };
  } catch (error) {
    if (error instanceof SafeFetchError) {
      return { discovery: { status: "UNKNOWN", url: null }, body: null };
    }
    throw error;
  }
}

export interface RobotsAndSitemapDiscovery {
  robotsTxt: DiscoveryResult;
  sitemap: DiscoveryResult;
}

// Lightweight discovery only — at most two requests (robots.txt, then one
// sitemap candidate). Never crawls a sitemap's contents, never fetches
// every URL a robots.txt might reference, never evaluates crawl
// directives. Discovery order: prefer a Sitemap: directive declared in
// robots.txt; fall back to the conventional /sitemap.xml path only when
// robots.txt wasn't confirmed FOUND or declared no Sitemap: line.
export async function discoverRobotsTxtAndSitemap(
  finalUrl: string
): Promise<RobotsAndSitemapDiscovery> {
  const robotsTxtUrl = new URL("/robots.txt", finalUrl).toString();
  const robotsTxtProbe = await probe(robotsTxtUrl);

  const sitemapDirectives =
    robotsTxtProbe.discovery.status === "FOUND" && robotsTxtProbe.body
      ? extractSitemapDirectives(robotsTxtProbe.body)
      : [];

  const sitemapCandidateUrl =
    sitemapDirectives.length > 0
      ? sitemapDirectives[0]
      : new URL("/sitemap.xml", finalUrl).toString();

  const sitemapProbe = await probe(sitemapCandidateUrl);

  return {
    robotsTxt: robotsTxtProbe.discovery,
    sitemap: sitemapProbe.discovery,
  };
}
