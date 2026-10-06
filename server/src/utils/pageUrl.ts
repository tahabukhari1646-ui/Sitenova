import * as net from "node:net";
import { isBlockedAddress } from "./ipRanges";

// Stage P1/P2: shared page-level URL resolution for any module that lets a
// user target a SPECIFIC PAGE of a monitored Website (Performance's PSI
// checks, SEO's on-page checks) rather than only the website's saved
// homepage. Relocated here (Stage P2) from performance/pageUrl.ts so
// Performance and SEO always agree on the exact same normalization/
// validation/page-identity rules for a given input — two independently
// maintained copies would risk silently diverging, which would break the
// "one shared selected page" guarantee both features depend on.
//
// This module is deliberately NOT safeFetch.ts reused wholesale --
// safeFetch exists to protect SENTINEL's OWN outbound connections (DNS-
// rebinding-resistant, connects itself). For Performance, Google's
// PageSpeed Insights infrastructure is what actually connects to the target
// URL, never this server. For SEO, executeSeoCheck's own fetchSeoPage DOES
// go through safeFetch for the actual outbound request — this module only
// decides WHICH url string is authorized to be requested (same-origin
// check, blocked-hostname-literal guard against pointing external
// infrastructure at localhost/private IPs), it never performs or replaces
// the network-level SSRF protections themselves.

export type PageUrlErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "CREDENTIALS_NOT_ALLOWED"
  | "BLOCKED_DESTINATION"
  | "HOSTNAME_MISMATCH";

export class PageUrlValidationError extends Error {
  code: PageUrlErrorCode;

  constructor(code: PageUrlErrorCode, message: string) {
    super(message);
    this.name = "PageUrlValidationError";
    this.code = code;
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function bareHostname(hostname: string): string {
  // URL.hostname keeps IPv6 literals bracketed, e.g. "[::1]".
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

// "localhost" is not a literal IP (net.isIP returns 0 for it), so it needs
// an explicit check alongside the literal-IP/private-range check below --
// no DNS lookup is performed here (see module doc comment for why).
function isBlockedHostname(hostname: string): boolean {
  const bare = bareHostname(hostname).toLowerCase();
  if (bare === "localhost") return true;

  const family = net.isIP(bare);
  if (family === 0) return false; // not a literal IP -- cannot classify further without DNS, intentionally out of scope
  return isBlockedAddress(bare, family as 4 | 6);
}

function parseAndValidate(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new PageUrlValidationError("INVALID_URL", "The page URL could not be parsed.");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new PageUrlValidationError(
      "UNSUPPORTED_PROTOCOL",
      "The page URL's protocol is not supported — only http and https are allowed."
    );
  }

  if (parsed.username || parsed.password) {
    throw new PageUrlValidationError("CREDENTIALS_NOT_ALLOWED", "The page URL must not contain credentials.");
  }

  return parsed;
}

// Full validation + normalization for an EXPLICITLY user-supplied page URL.
// Strips the fragment (never sent to any server, never affects what PSI
// measures or what SEO fetches) and returns the WHATWG-canonical `.href`
// form — hostname lowercased, root path normalized to include a trailing
// "/", redundant default ports stripped, all for free via URL parsing
// itself; the query string is preserved exactly, since it can genuinely
// change what a page renders/measures.
export function normalizePageUrl(raw: string): string {
  const parsed = parseAndValidate(raw);

  if (isBlockedHostname(parsed.hostname)) {
    throw new PageUrlValidationError(
      "BLOCKED_DESTINATION",
      "This page URL resolves to a destination Sentinel AI does not allow."
    );
  }

  parsed.hash = "";
  return parsed.href;
}

// Fail-open canonicalization for Website.url itself (the default/homepage
// path only) -- deliberately NOT running the blocked-hostname/localhost
// check, and never throwing on a malformed input. Website.url was already
// accepted at website-creation time (no protocol/hostname validation has
// ever existed there) and is already used successfully today for
// automatic Performance/SEO checks, including real existing test websites
// saved as e.g. http://localhost:1/ -- applying the new restrictive check
// retroactively to that existing, already-trusted value would be a
// regression neither stage may introduce. Used identically for both
// modules' automatic schedulers, both modules' "no url supplied" default,
// and (via the same rule expressed in SQL) each module's own migration
// backfill, so every caller always agrees on the exact same pageUrl
// representation for a given Website.url.
export function safeCanonicalize(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    parsed.hash = "";
    return parsed.href;
  } catch {
    return raw;
  }
}

// Stage P1 §8: exact, case-insensitive hostname match — www.example.com
// and example.com are deliberately treated as DIFFERENT hosts, never
// silently assumed equivalent. A prefix/substring check is never used
// (that would allow e.g. "example.com.attacker.com" to pass).
function hostnamesMatch(pageUrl: string, websiteUrl: string): boolean {
  const pageHostname = bareHostname(new URL(pageUrl).hostname).toLowerCase();
  const websiteHostname = bareHostname(new URL(websiteUrl).hostname).toLowerCase();
  return pageHostname === websiteHostname;
}

// The single entry point every Performance/SEO endpoint uses to resolve
// which page a check should target:
//   - no explicit page URL supplied -> Website.url, fail-open canonicalized
//     (backward-compatible default, Stage P1 §5/§14)
//   - an explicit page URL supplied -> fully validated/normalized, AND
//     required to share the monitored Website's exact hostname (Stage P1
//     §7) -- never an arbitrary external domain, never a private/loopback
//     target.
export function resolvePageUrl(rawPageUrl: string | undefined, websiteUrl: string): string {
  if (rawPageUrl === undefined || rawPageUrl.trim().length === 0) {
    return safeCanonicalize(websiteUrl);
  }

  const normalizedPageUrl = normalizePageUrl(rawPageUrl);

  if (!hostnamesMatch(normalizedPageUrl, websiteUrl)) {
    throw new PageUrlValidationError(
      "HOSTNAME_MISMATCH",
      "The page URL must belong to this website."
    );
  }

  return normalizedPageUrl;
}
