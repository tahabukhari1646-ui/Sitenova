import * as http from "node:http";
import * as https from "node:https";
import * as dns from "node:dns";
import * as net from "node:net";

import { isBlockedAddress } from "./ipRanges";

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

export type SafeFetchErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "CREDENTIALS_NOT_ALLOWED"
  | "BLOCKED_DESTINATION"
  | "DNS_FAILURE"
  | "TIMEOUT"
  | "TOO_MANY_REDIRECTS"
  | "INVALID_REDIRECT"
  | "RESPONSE_TOO_LARGE"
  | "DISALLOWED_CONTENT_TYPE"
  | "NETWORK_FAILURE";

// Deliberately a plain Error (not AppError) — AppError's whole shape is
// "maps 1:1 to a public HTTP status code for the Express error handler",
// which doesn't fit here: a future caller (SEO scheduler vs. a manual-check
// controller) will want to react very differently to e.g. BLOCKED_DESTINATION
// (log + skip in a scheduler, or a 400 in a manual endpoint). That mapping
// decision belongs to the caller, not to this generic utility — mirrors how
// PageSpeedError lives with its own integration rather than in errors/.
export class SafeFetchError extends Error {
  code: SafeFetchErrorCode;

  constructor(code: SafeFetchErrorCode, message: string) {
    super(message);
    this.name = "SafeFetchError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface SafeFetchOptions {
  /** Overall deadline across the whole request, including every redirect hop. */
  timeoutMs?: number;
  maxRedirects?: number;
  maxBodyBytes?: number;
  /**
   * If provided, the final response's Content-Type must start with one of
   * these (case-insensitive) or the request fails with
   * DISALLOWED_CONTENT_TYPE. Left undefined, any content type is accepted —
   * this utility is intentionally generic, not HTML-specific (a future SEO
   * fetcher is expected to pass e.g. ["text/html"] itself).
   */
  allowedContentTypes?: string[];
  userAgent?: string;
  /**
   * Stage 20.1: stop as soon as the final response's status and headers
   * arrive -- the body is never downloaded and `body` is "". For uptime
   * checks, which only need the status code and response time.
   */
  discardBody?: boolean;
}

export interface SafeFetchResult {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  contentType: string | null;
  body: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;
const DEFAULT_USER_AGENT = "SentinelAI/1.0 Website Monitor";
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

function parseAndValidateUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeFetchError("INVALID_URL", "The provided URL could not be parsed.");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SafeFetchError(
      "UNSUPPORTED_PROTOCOL",
      `Protocol '${url.protocol}' is not allowed — only http and https are supported.`
    );
  }

  // Credentials embedded in a URL (http://user:pass@host/) serve no
  // legitimate purpose for a monitored website and are rejected outright
  // rather than silently stripped or forwarded.
  if (url.username || url.password) {
    throw new SafeFetchError(
      "CREDENTIALS_NOT_ALLOWED",
      "URLs containing credentials are not allowed."
    );
  }

  return url;
}

function bareHostname(url: URL): string {
  // url.hostname keeps IPv6 literals bracketed, e.g. "[::1]" — every
  // consumer here (net.isIP, dns.lookup, isBlockedAddress) needs the bare
  // address instead.
  const { hostname } = url;
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

// Stage 20.1: the automated test suite checks a fake website on this
// computer, which the rules below would (correctly) block. This is the one
// narrow exception: loopback ONLY (127.0.0.0/8 and ::1 -- never private
// networks or the 169.254.169.254 metadata address), and only when BOTH
// NODE_ENV=test and SAFE_FETCH_ALLOW_LOOPBACK_FOR_TESTS=true are set, which
// only tests/setup/preload.ts does. Read at call time so a test can turn it
// off to prove loopback is blocked.
function isLoopbackAllowedForTests(address: string, family: 4 | 6): boolean {
  if (process.env.NODE_ENV !== "test" || process.env.SAFE_FETCH_ALLOW_LOOPBACK_FOR_TESTS !== "true") {
    return false;
  }
  return family === 4 ? address.startsWith("127.") : address === "::1";
}

// Every block decision in this file goes through here.
export function isDestinationBlocked(address: string, family: 4 | 6): boolean {
  return isBlockedAddress(address, family) && !isLoopbackAllowedForTests(address, family);
}

// If the URL's host is itself a literal IP address, it can be validated
// immediately with no DNS involved at all — nothing to resolve, nothing to
// rebind. Returns the family if it's a literal IP, or null if it's a name
// that still needs to be resolved later (inside the request's own lookup).
function rejectIfBlockedLiteralIp(hostname: string): void {
  const family = net.isIP(hostname);
  if (family === 0) return; // not a literal IP — handled at connect time

  if (isDestinationBlocked(hostname, family as 4 | 6)) {
    throw new SafeFetchError(
      "BLOCKED_DESTINATION",
      "This destination is not allowed."
    );
  }
}

// ---------------------------------------------------------------------------
// DNS-rebinding-resistant connection
// ---------------------------------------------------------------------------

// The critical piece: Node's `lookup` option on http(s).request is invoked
// by Node's own connection-establishment code at the moment the socket is
// actually opened — not by us, ahead of time. Validating inside this
// callback means the address that gets validated IS the address that gets
// connected to, by construction. There is no second, independent DNS
// resolution later that a rebinding attacker could aim at a different
// answer. This is why safeFetch is built on node:http/node:https rather
// than the global fetch() (which offers no hook into its internal
// resolution) — see the Stage 14.1 report for the full DNS-rebinding
// discussion and residual limitations.
// Node's net internals (Happy Eyeballs / dual-stack connection racing, since
// Node 18+) call a custom `lookup` with `{ all: true }` and expect the
// array-shaped callback `(err, addresses)` — NOT the classic single-address
// `(err, address, family)` form `dns.lookup` uses by default. Confirmed
// empirically against a real request during this stage's testing (a naive
// implementation that always used the singular form broke every real
// request with a confusing "Invalid IP address: undefined" error). This
// function supports both shapes so it behaves correctly regardless of which
// mode Node's internals request.
function safeLookup(
  hostname: string,
  options: { all?: boolean } | ((err: NodeJS.ErrnoException | null, ...rest: unknown[]) => void),
  callback?: (err: NodeJS.ErrnoException | null, ...rest: unknown[]) => void
): void {
  const cb = typeof options === "function" ? options : callback!;
  const wantsAll = typeof options === "object" && options !== null && options.all === true;

  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      cb(err);
      return;
    }

    if (addresses.length === 0) {
      cb(Object.assign(new Error("DNS lookup returned no addresses."), { code: "ENODATA" }));
      return;
    }

    // Conservative-by-design: if ANY resolved address is unsafe, the whole
    // hostname is treated as blocked, rather than picking a "safe" one from
    // a mixed set — a hostname that resolves to both a public and a private
    // address is itself a red flag worth rejecting outright.
    const blocked = addresses.some((a) => isDestinationBlocked(a.address, a.family as 4 | 6));
    if (blocked) {
      cb(Object.assign(new Error("Resolved address is blocked."), { code: "EBLOCKEDDESTINATION" }));
      return;
    }

    if (wantsAll) {
      cb(null, addresses);
    } else {
      const chosen = addresses[0];
      cb(null, chosen.address, chosen.family);
    }
  });
}

function classifyLookupError(err: NodeJS.ErrnoException): SafeFetchError {
  if (err.code === "EBLOCKEDDESTINATION") {
    return new SafeFetchError("BLOCKED_DESTINATION", "This destination is not allowed.");
  }
  return new SafeFetchError("DNS_FAILURE", "The hostname could not be resolved.");
}

// ---------------------------------------------------------------------------
// Single-hop request (no redirect-following — the caller drives that)
// ---------------------------------------------------------------------------

interface HopResult {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  stream: http.IncomingMessage;
}

function requestOneHop(
  url: URL,
  userAgent: string,
  remainingMs: number
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const hostname = bareHostname(url);

    const req = client.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        // `lookup` controls only which address the socket connects to; the
        // Host header, TLS SNI, and certificate hostname verification below
        // all still use `hostname` as given, so HTTPS security is unaffected.
        lookup: safeLookup as unknown as typeof dns.lookup,
        servername: url.protocol === "https:" ? hostname : undefined,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        },
        timeout: remainingMs,
      },
      (res) => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers,
          stream: res,
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new SafeFetchError("TIMEOUT", "The request timed out."));
    });

    req.on("error", (err) => {
      if (err instanceof SafeFetchError) {
        reject(err);
        return;
      }
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "EBLOCKEDDESTINATION" || nodeErr.code?.startsWith("EBLOCKED")) {
        reject(classifyLookupError(nodeErr));
        return;
      }
      if (
        nodeErr.code === "ENOTFOUND" ||
        nodeErr.code === "EAI_AGAIN" ||
        nodeErr.code === "ENODATA"
      ) {
        reject(classifyLookupError(nodeErr));
        return;
      }
      reject(new SafeFetchError("NETWORK_FAILURE", "The request failed due to a network error."));
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Body streaming with a hard, enforced-while-streaming size cap
// ---------------------------------------------------------------------------

function readBodyWithLimit(
  stream: http.IncomingMessage,
  maxBytes: number,
  contentType: string | null,
  allowedContentTypes: string[] | undefined
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (allowedContentTypes && allowedContentTypes.length > 0) {
      const normalized = (contentType ?? "").toLowerCase();
      const allowed = allowedContentTypes.some((t) => normalized.startsWith(t.toLowerCase()));
      if (!allowed) {
        stream.destroy();
        reject(
          new SafeFetchError(
            "DISALLOWED_CONTENT_TYPE",
            `Response content type '${contentType ?? "unknown"}' is not allowed.`
          )
        );
        return;
      }
    }

    const chunks: Buffer[] = [];
    let received = 0;

    stream.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        // Destroy immediately — never let the rest of the body arrive.
        stream.destroy();
        reject(
          new SafeFetchError(
            "RESPONSE_TOO_LARGE",
            `Response exceeded the ${maxBytes}-byte limit.`
          )
        );
        return;
      }
      chunks.push(chunk);
    });

    stream.on("end", () => {
      const charsetMatch = /charset=([^;]+)/i.exec(contentType ?? "");
      const charset = charsetMatch ? charsetMatch[1].trim().toLowerCase() : "utf-8";
      try {
        resolve(Buffer.concat(chunks).toString(charset as BufferEncoding));
      } catch {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      }
    });

    stream.on("error", (err) => {
      if (err instanceof SafeFetchError) {
        reject(err);
        return;
      }
      reject(new SafeFetchError("NETWORK_FAILURE", "The response stream failed."));
    });
  });
}

function flattenHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    result[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
}

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  const requestedUrl = rawUrl;
  let currentUrl = parseAndValidateUrl(rawUrl);
  rejectIfBlockedLiteralIp(bareHostname(currentUrl));

  const deadlineAt = Date.now() + timeoutMs;

  for (let hop = 0; ; hop++) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new SafeFetchError("TIMEOUT", "The request timed out.");
    }

    const hopResult = await requestOneHop(currentUrl, userAgent, remainingMs);

    if (REDIRECT_STATUS_CODES.has(hopResult.statusCode)) {
      hopResult.stream.destroy(); // never read a redirect's body
      const location = hopResult.headers.location;

      if (!location) {
        // A redirect status with no Location header has nothing to follow —
        // treat it as the final (if unusual) response instead of failing.
        return {
          requestedUrl,
          finalUrl: currentUrl.toString(),
          statusCode: hopResult.statusCode,
          headers: flattenHeaders(hopResult.headers),
          contentType: null,
          body: "",
        };
      }

      if (hop + 1 >= maxRedirects) {
        throw new SafeFetchError(
          "TOO_MANY_REDIRECTS",
          `Exceeded the maximum of ${maxRedirects} redirects.`
        );
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new SafeFetchError("INVALID_REDIRECT", "Redirect Location header could not be parsed.");
      }

      // Every hop is revalidated from scratch — a redirect to a private
      // address is blocked here BEFORE any connection to it is attempted.
      // Reuses parseAndValidateUrl's full checks (protocol, credentials)
      // rather than a redirect-specific subset, but a failure at this point
      // is still reported as INVALID_REDIRECT/BLOCKED_DESTINATION context —
      // the caller only needs to know "the redirect target was rejected",
      // and parseAndValidateUrl's own thrown codes already say why.
      currentUrl = parseAndValidateUrl(nextUrl.toString());
      rejectIfBlockedLiteralIp(bareHostname(currentUrl));
      continue;
    }

    const contentType = (hopResult.headers["content-type"] as string | undefined) ?? null;

    if (options.discardBody) {
      hopResult.stream.destroy(); // status + headers are all the caller needs
      return {
        requestedUrl,
        finalUrl: currentUrl.toString(),
        statusCode: hopResult.statusCode,
        headers: flattenHeaders(hopResult.headers),
        contentType,
        body: "",
      };
    }

    const body = await readBodyWithLimit(
      hopResult.stream,
      maxBodyBytes,
      contentType,
      options.allowedContentTypes
    );

    return {
      requestedUrl,
      finalUrl: currentUrl.toString(),
      statusCode: hopResult.statusCode,
      headers: flattenHeaders(hopResult.headers),
      contentType,
      body,
    };
  }
}
