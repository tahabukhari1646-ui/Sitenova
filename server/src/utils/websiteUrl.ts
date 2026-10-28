import * as dns from "node:dns";
import * as net from "node:net";
import { ValidationError } from "../errors/AppError";
import { isDestinationBlocked } from "./safeFetch";

// Stage 20.1: the add/edit-website gate (SSRF). Rejects, with one curated
// 400 message, any URL the uptime/SEO checks must never contact:
//   - not a valid http:// or https:// URL, or containing credentials;
//   - "localhost" / "*.localhost";
//   - a literal private/internal IP (same ranges as safeFetch);
//   - a hostname that currently resolves to any private/internal address.
// A hostname that does not resolve at all is ALLOWED (a typo or temporary
// DNS outage just shows up as a failing check) -- this gate is about where
// the server may connect, not whether the site exists.
//
// This is a friendly early refusal, not the security boundary: DNS can
// change after saving, so safeFetch re-validates the actual address on
// every request (connect-time lookup, every redirect).

export const UNSAFE_WEBSITE_URL_MESSAGE =
  "This address can't be monitored. Use a public http:// or https:// website address.";

function resolveAll(hostname: string): Promise<{ address: string; family: number }[] | null> {
  return new Promise((resolve) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      resolve(err ? null : addresses);
    });
  });
}

export async function assertMonitorableUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ValidationError(UNSAFE_WEBSITE_URL_MESSAGE);
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new ValidationError(UNSAFE_WEBSITE_URL_MESSAGE);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new ValidationError(UNSAFE_WEBSITE_URL_MESSAGE);
  }

  const literalFamily = net.isIP(hostname);
  if (literalFamily !== 0) {
    if (isDestinationBlocked(hostname, literalFamily as 4 | 6)) {
      throw new ValidationError(UNSAFE_WEBSITE_URL_MESSAGE);
    }
    return;
  }

  const addresses = await resolveAll(hostname);
  if (addresses?.some((a) => isDestinationBlocked(a.address, a.family as 4 | 6))) {
    throw new ValidationError(UNSAFE_WEBSITE_URL_MESSAGE);
  }
}
