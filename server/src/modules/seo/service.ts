import { websiteRepository } from "../website/repository";
import { seoRepository, MAX_HISTORY_RECORDS } from "./repository";
import { fetchSeoPage, discoverRobotsTxtAndSitemap } from "./fetcher";
import { parseSeoHtml } from "./parser";
import { analyzeSeoIssues } from "./issues";
import { deriveSeoChanges } from "./changes";
import { deriveSeoAlerts } from "./alerts";
import { SafeFetchError, type SafeFetchErrorCode } from "../../utils/safeFetch";
import { PageUrlValidationError, resolvePageUrl, safeCanonicalize, type PageUrlErrorCode } from "../../utils/pageUrl";
import { AppError, NotFoundError, ValidationError } from "../../errors/AppError";
import type {
  DiscoveryResult,
  SeoCheckCreateData,
  SeoPageObservation,
  SeoStructuredData,
} from "./types";
import type { SeoCheck } from "../../generated/prisma/client";

// Mirrors monitor/service.ts's and performance/service.ts's own private
// verifyOwnership exactly — each module keeps its own tiny ownership check
// against websiteRepository rather than sharing a cross-module import,
// consistent with the existing, deliberate pattern. This is where ownership
// is enforced for SEO checks; Stage 14.6's future controller only needs to
// extract req.user!.userId and pass it straight through, exactly like
// performanceController.runCheck already does.
async function verifyOwnership(websiteId: string, userId: string) {
  const website = await websiteRepository.findById(websiteId, userId);

  if (!website) {
    throw new NotFoundError(`Website with id '${websiteId}' not found.`);
  }

  return website;
}

// Stage 14.3A-approved persistence mapping: FOUND -> true (+ discovered
// URL), NOT_FOUND -> false (+ null), UNKNOWN -> null (+ null). UNKNOWN must
// never collapse to false — that would falsely claim "confirmed absent"
// when the check was actually inconclusive.
export function toDiscoveryPersistence(result: DiscoveryResult): {
  found: boolean | null;
  url: string | null;
} {
  if (result.status === "FOUND") return { found: true, url: result.url };
  if (result.status === "NOT_FOUND") return { found: false, url: null };
  return { found: null, url: null };
}

// Reverse of toDiscoveryPersistence, for read-time analysis of an already-
// persisted row: true -> FOUND (+ stored URL), false -> confirmed NOT_FOUND,
// null -> UNKNOWN. One typed helper, not duplicated ad hoc per read method.
export function toDiscoveryResult(found: boolean | null, url: string | null): DiscoveryResult {
  if (found === true) return { status: "FOUND", url };
  if (found === false) return { status: "NOT_FOUND", url: null };
  return { status: "UNKNOWN", url: null };
}

// Prisma returns structuredData as generic JsonValue. Every write goes
// through the approved parser (Stage 14.4), so the stored shape should
// always be valid — but a public read endpoint must never crash on
// unexpected historical data, so this is a small structural check (no
// schema-validation dependency) that fails safe to the zero-state rather
// than throwing.
export function toStructuredData(value: unknown): SeoStructuredData {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).jsonLdCount === "number" &&
    Array.isArray((value as Record<string, unknown>).types) &&
    ((value as Record<string, unknown>).types as unknown[]).every((t) => typeof t === "string") &&
    typeof (value as Record<string, unknown>).invalidCount === "number"
  ) {
    return value as SeoStructuredData;
  }
  return { jsonLdCount: 0, types: [], invalidCount: 0 };
}

// Bridges a persisted SeoCheck row back into analyzeSeoIssues' input shape.
// Exported for Stage 14.8's change engine (service.ts is the only place
// that knows how to turn a raw SeoCheck row into a SeoPageObservation).
export function toObservation(check: SeoCheck): SeoPageObservation {
  return {
    requestedUrl: check.requestedUrl,
    finalUrl: check.finalUrl,
    statusCode: check.statusCode,
    title: check.title,
    metaDescription: check.metaDescription,
    h1Count: check.h1Count,
    h1Text: check.h1Text,
    h2Count: check.h2Count,
    h3Count: check.h3Count,
    canonicalUrl: check.canonicalUrl,
    robotsMeta: check.robotsMeta,
    xRobotsTag: check.xRobotsTag,
    internalLinkCount: check.internalLinkCount,
    externalLinkCount: check.externalLinkCount,
    imageCount: check.imageCount,
    imagesMissingAltCount: check.imagesMissingAltCount,
    wordCount: check.wordCount,
    structuredData: toStructuredData(check.structuredData),
    robotsTxt: toDiscoveryResult(check.robotsTxtFound, check.robotsTxtUrl),
    sitemap: toDiscoveryResult(check.sitemapFound, check.sitemapUrl),
  };
}

// --- SafeFetchError -> public API error mapping ---
// Mirrors PageSpeedError's existing precedent (integrations/pagespeed.ts) —
// an "upstream external dependency failed" AppError with a fixed status,
// defined next to the service that needs it rather than centralized.
export class SeoCheckError extends AppError {
  constructor(message: string) {
    super(message, 502);
    this.name = "SeoCheckError";
  }
}

// Two-tier policy chosen for consistency with the existing API rather than
// inventing new statuses (e.g. 422/504) this codebase has never used:
// - the request itself is unacceptable (bad/unsupported URL, blocked
//   destination, disallowed content type, oversized/invalid response) -> 400
//   via the existing ValidationError.
// - the upstream target site was unreachable/erroring -> 502 via
//   SeoCheckError, exactly like PageSpeedError already does for PSI.
const VALIDATION_TIER_CODES = new Set<SafeFetchErrorCode>([
  "INVALID_URL",
  "UNSUPPORTED_PROTOCOL",
  "CREDENTIALS_NOT_ALLOWED",
  "BLOCKED_DESTINATION",
  "DISALLOWED_CONTENT_TYPE",
  "RESPONSE_TOO_LARGE",
  "INVALID_REDIRECT",
]);

// Curated, generic, user-safe messages — SafeFetchError's own .message is
// never forwarded verbatim to the public API. Today's internal messages are
// already generic (Stage 14.1), but this keeps the public contract
// independent of that internal wording.
const SAFE_FETCH_MESSAGES: Record<SafeFetchErrorCode, string> = {
  INVALID_URL: "This website's URL could not be checked because it is not a valid URL.",
  UNSUPPORTED_PROTOCOL: "This website's URL could not be checked because its protocol is not supported.",
  CREDENTIALS_NOT_ALLOWED: "This website's URL could not be checked because it contains credentials.",
  BLOCKED_DESTINATION:
    "This website's URL could not be checked because it resolves to a destination Sentinel AI does not allow.",
  DISALLOWED_CONTENT_TYPE: "This website's response could not be checked because its content type is not supported.",
  RESPONSE_TOO_LARGE: "This website's response could not be checked because it was too large.",
  INVALID_REDIRECT: "This website's response could not be checked because one of its redirects was invalid.",
  DNS_FAILURE: "This website could not be reached (DNS lookup failed).",
  TIMEOUT: "This website did not respond in time.",
  TOO_MANY_REDIRECTS: "This website could not be reached (too many redirects).",
  NETWORK_FAILURE: "This website could not be reached due to a network error.",
};

function mapSafeFetchError(error: SafeFetchError): AppError {
  const message = SAFE_FETCH_MESSAGES[error.code];
  if (VALIDATION_TIER_CODES.has(error.code)) {
    return new ValidationError(message);
  }
  return new SeoCheckError(message);
}

// Stage P2: curated, generic, user-safe messages for the shared page-URL
// resolver — mirrors performance/service.ts's identical PAGE_URL_MESSAGES
// mapping exactly. PageUrlValidationError's own .message is never forwarded
// verbatim, same discipline as mapSafeFetchError above.
const PAGE_URL_MESSAGES: Record<PageUrlErrorCode, string> = {
  INVALID_URL: "The page URL could not be parsed. Provide a full URL, e.g. https://example.com/about/.",
  UNSUPPORTED_PROTOCOL: "The page URL's protocol is not supported — only http and https are allowed.",
  CREDENTIALS_NOT_ALLOWED: "The page URL must not contain credentials.",
  BLOCKED_DESTINATION: "This page URL resolves to a destination Sentinel AI does not allow.",
  HOSTNAME_MISMATCH: "The page URL must belong to this website.",
};

function mapPageUrlError(error: PageUrlValidationError): AppError {
  return new ValidationError(PAGE_URL_MESSAGES[error.code]);
}

// Shared by every endpoint below so "no page URL supplied -> Website.url"
// and "explicit page URL -> validated + same-hostname-enforced" behave
// identically everywhere, and identically to Performance's own resolution
// (Stage P2's whole point — one shared selected page for both modules).
function resolveRequestedPageUrl(rawPageUrl: string | undefined, websiteUrl: string): string {
  try {
    return resolvePageUrl(rawPageUrl, websiteUrl);
  } catch (error) {
    if (error instanceof PageUrlValidationError) {
      throw mapPageUrlError(error);
    }
    throw error;
  }
}

// The single SEO check pipeline, shared by both manual and automatic
// execution so neither duplicates fetch/parse/discover/persist logic:
//   1. fetch the root page (fetchSeoPage -> safeFetch; any thrown
//      SafeFetchError aborts here, before any row exists)
//   2. parse the returned HTML against its FINAL url (post-redirect),
//      never the originally requested one
//   3. run robots.txt/sitemap discovery against that same final origin
//   4. map the three-state discovery result to the approved
//      true/false/null persistence contract
//   5. persist exactly one SeoCheck row
//
// No transaction: everything before the final `seoRepository.create` call
// is pure computation or read-only HTTP (fetchSeoPage, parseSeoHtml,
// discoverRobotsTxtAndSitemap) — there is only ONE write in this whole
// pipeline, so there is nothing for a transaction to make atomic that isn't
// already atomic by virtue of being a single INSERT. Holding a DB
// transaction open across the network calls above would only block a
// connection-pool slot for the multi-second duration of those requests,
// which is exactly what should be avoided.
//
// analyzeSeoIssues() is intentionally never called here — issues remain a
// read-time derivation (Stage 14.4), not something this write path computes
// or stores.
//
// Stage 15.2: SEO Alert generation is a side effect of a successful check,
// never a reason to fail one. Any unexpected failure here is caught and
// logged (never rethrown) so the caller always gets back the successfully
// persisted SeoCheck regardless of Alert-write outcome — matching §15's
// requirement that SeoCheck persistence stay independent from Alert
// persistence.
//
// IMPORTANT — this is NOT fully self-healing (Stage 15.2 §16 explicitly
// required tracing this rather than assuming it): if this step fails for
// check B, and a later check C is compared against B (not against the
// pre-B state), a genuinely-new-at-B issue that's still present at C reads
// as PERSISTENT from B→C's perspective (present in both), not new — so the
// missed OPENED alert for that transition is never regenerated by any
// later check. This is an accepted, narrow, explicitly-documented residual
// gap: the underlying SeoCheck/history/change data is never lost or
// incorrect (Stage 14.8's history view is unaffected), only a derived
// notification-side-effect for that specific transition may be missing.
// Deliberately not solved with an outbox/retry system per §16's own
// guidance not to over-engineer this.
async function persistSeoAlerts(
  websiteId: string,
  userId: string,
  seoCheckId: string,
  changeSet: ReturnType<typeof deriveSeoChanges>
): Promise<void> {
  const alerts = deriveSeoAlerts(websiteId, seoCheckId, changeSet);
  if (alerts.length === 0) return;

  try {
    await seoRepository.createAlertsWithNotifications(alerts, userId);
  } catch (error) {
    console.error(
      `SEO alert write failed for website ${websiteId}, check ${seoCheckId}:`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

// Callers are trusted to have already established the caller is allowed to
// check this website (ownership for manual, the active-website repository
// query for automatic) — this function itself performs no authorization.
// `pageUrl` is the already-resolved (Stage P2) page identity to fetch and
// persist against — callers decide how it was resolved (full validation for
// an explicit manual page, safeCanonicalize-only for the automatic
// scheduler's homepage), this function only executes the pipeline for
// whatever it's given.
async function executeSeoCheck(website: { id: string; url: string; userId: string }, pageUrl: string) {
  // Only the root-page fetch is wrapped: discoverRobotsTxtAndSitemap
  // already internally catches SafeFetchError and resolves to UNKNOWN
  // (fetcher.ts's probe()) rather than throwing, so discovery failures
  // never reach here and never need this mapping.
  let pageResult;
  try {
    pageResult = await fetchSeoPage(pageUrl);
  } catch (error) {
    if (error instanceof SafeFetchError) {
      throw mapSafeFetchError(error);
    }
    throw error;
  }

  const parsed = parseSeoHtml(pageResult.body, pageResult.finalUrl);

  const discovery = await discoverRobotsTxtAndSitemap(pageResult.finalUrl);
  const robotsTxt = toDiscoveryPersistence(discovery.robotsTxt);
  const sitemap = toDiscoveryPersistence(discovery.sitemap);

  const xRobotsTag = pageResult.headers["x-robots-tag"] ?? null;

  const data: SeoCheckCreateData = {
    pageUrl,
    requestedUrl: pageResult.requestedUrl,
    finalUrl: pageResult.finalUrl,
    statusCode: pageResult.statusCode,

    title: parsed.title,
    metaDescription: parsed.metaDescription,

    h1Count: parsed.h1Count,
    h1Text: parsed.h1Text,
    h2Count: parsed.h2Count,
    h3Count: parsed.h3Count,

    canonicalUrl: parsed.canonicalUrl,

    robotsMeta: parsed.robotsMeta,
    xRobotsTag,

    internalLinkCount: parsed.internalLinkCount,
    externalLinkCount: parsed.externalLinkCount,

    imageCount: parsed.imageCount,
    imagesMissingAltCount: parsed.imagesMissingAltCount,

    wordCount: parsed.wordCount,

    robotsTxtFound: robotsTxt.found,
    robotsTxtUrl: robotsTxt.url,

    sitemapFound: sitemap.found,
    sitemapUrl: sitemap.url,

    structuredData: parsed.structuredData,
  };

  // Fetched BEFORE create() below, deliberately — this is the one true
  // SAME-PAGE predecessor precisely because the new row does not exist yet
  // at the moment of this read. Querying "the latest check" AFTER
  // persisting the new one would instead return the new row itself (self-
  // comparison), which Stage 15.2 §10 explicitly warns against. findLatest
  // is already pageUrl-scoped (Stage P2), so a /morrisons/ check can never
  // be compared against the homepage's history, or vice versa.
  const previousCheck = await seoRepository.findLatest(website.id, pageUrl);

  const created = await seoRepository.create(website.id, data);

  // Reuses the EXISTING Stage 14.8 change engine as the sole source of
  // truth for what changed — no independent title/meta/H1/canonical/
  // robots/sitemap/structured-data/indexability comparison is performed
  // here. Deliberately a separate step from the SeoCheck insert above, not
  // one combined transaction — see persistSeoAlerts' own doc comment for
  // why, and for the honest self-healing analysis.
  const changeSet = deriveSeoChanges(
    previousCheck ? toObservation(previousCheck) : null,
    toObservation(created)
  );
  await persistSeoAlerts(website.id, website.userId, created.id, changeSet);

  return created;
}

export const seoService = {
  // One manual SEO check for an already-owned website: verify ownership,
  // resolve the requested page (Stage P2 — no url -> homepage, an explicit
  // url -> fully validated + same-hostname-enforced, identical resolution
  // to Performance's own runCheck), then run the shared pipeline.
  runSeoCheck: async (websiteId: string, userId: string, rawPageUrl?: string) => {
    const website = await verifyOwnership(websiteId, userId);
    const pageUrl = resolveRequestedPageUrl(rawPageUrl, website.url);
    return executeSeoCheck(website, pageUrl);
  },
  // Scheduler-only entry point: no userId/ownership check because there is
  // no authenticated user in a background cycle — `website` is trusted as-is
  // since the caller (the SEO worker) already fetched it directly via
  // seoRepository.findActiveWebsites(), not from user input. Shares the
  // exact same pipeline as runSeoCheck above, so manual and automatic checks
  // always produce identical SeoCheck rows — only the ownership-verification
  // step differs, appropriately. Never exposed through a public route.
  //
  // Stage P2: ALWAYS the website's own homepage (safeCanonicalize, never
  // resolveRequestedPageUrl/full validation — see utils/pageUrl.ts's own
  // doc comment for why) — automatic scheduling never enrolls a manually-
  // tested subpage, by construction, not by a runtime check.
  runAutomaticSeoCheck: async (website: { id: string; url: string; userId: string }) => {
    const pageUrl = safeCanonicalize(website.url);
    return executeSeoCheck(website, pageUrl);
  },

  // Matches performanceService.getLatest / monitorService.getLatest's own
  // convention exactly: no check yet -> a normal 200 with check: null, not
  // a 404. Composes full derived analysis at read time (Stage 14.4) —
  // never persisted, never computed inside runSeoCheck. Stage P2: resolves
  // and returns `pageUrl` alongside the check, matching Performance's own
  // {check, pageUrl} contract, so the caller always knows which page a
  // (possibly null) result belongs to.
  getLatest: async (websiteId: string, userId: string, rawPageUrl?: string) => {
    const website = await verifyOwnership(websiteId, userId);
    const pageUrl = resolveRequestedPageUrl(rawPageUrl, website.url);
    const check = await seoRepository.findLatest(websiteId, pageUrl);

    if (!check) {
      return { check: null, analysis: null, pageUrl };
    }

    // Stage 14.10: the raw Prisma row's structuredData is a generic JSON
    // value — toStructuredData() was already trusted to shape-guard it for
    // toObservation()'s internal use (analysis below), but the `check`
    // object returned to the client was bypassing that guard entirely. A
    // public read endpoint must never forward unverified historical JSON as
    // if it satisfied the SeoStructuredData contract.
    return {
      check: { ...check, structuredData: toStructuredData(check.structuredData) },
      analysis: analyzeSeoIssues(toObservation(check)),
      pageUrl,
    };
  },

  // History returns raw snapshots, each now additionally carrying a
  // deterministic `changes` set (Stage 14.8) derived against its own true
  // chronological predecessor — never full per-row issue lists (Stage
  // 14.6 §10's preferred default still applies: only newIssues/
  // resolvedIssues are attached, not the complete issue list every row
  // already implicitly has via /seo/latest for the newest one).
  //
  // findHistoryWithBaseline fetches one row PAST the public cap so the
  // oldest VISIBLE row can still be compared correctly; that extra row is
  // sliced off before `checks` is returned — the API never exposes more
  // than MAX_HISTORY_RECORDS rows, only uses the (n+1)th as a comparison
  // baseline for the nth. Stage P2: both queries are now pageUrl-scoped, so
  // this baseline/cap logic operates entirely within the selected page's
  // own history — a page with only one check of its own correctly reports
  // isBaseline: true rather than comparing against a different page's row.
  getHistory: async (websiteId: string, userId: string, rawPageUrl?: string) => {
    const website = await verifyOwnership(websiteId, userId);
    const pageUrl = resolveRequestedPageUrl(rawPageUrl, website.url);

    const [rowsWithBaseline, total] = await Promise.all([
      seoRepository.findHistoryWithBaseline(websiteId, pageUrl),
      seoRepository.count(websiteId, pageUrl),
    ]);

    const checks = rowsWithBaseline.slice(0, MAX_HISTORY_RECORDS);

    // rowsWithBaseline is newest-first (checkedAt DESC, id DESC): index 0
    // is the newest check, higher indices are progressively older. For the
    // row at index i, its true chronological predecessor is the row one
    // step OLDER, i.e. at index i + 1 in this same DESC array — never
    // index i - 1, which would be newer and backwards. This is exactly why
    // the array is walked with `i + 1`, not `i - 1`, below.
    const checksWithChanges = checks.map((check, i) => {
      const previousRow = rowsWithBaseline[i + 1] ?? null;
      const previousObservation = previousRow ? toObservation(previousRow) : null;
      return {
        ...check,
        // Same Stage 14.10 fix as getLatest — never forward the raw JSON
        // value; guarantee the SeoStructuredData contract at the API
        // boundary, not only internally for change derivation.
        structuredData: toStructuredData(check.structuredData),
        changes: deriveSeoChanges(previousObservation, toObservation(check)),
      };
    });

    return {
      pageUrl,
      checks: checksWithChanges,
      returned: checksWithChanges.length,
      total,
      truncated: total > checksWithChanges.length,
    };
  },
};
