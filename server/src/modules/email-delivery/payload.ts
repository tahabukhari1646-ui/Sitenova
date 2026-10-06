import { buildEmailEventContent } from "./content";
import type { EmailTemplateAlertInput, EmailTemplateWebsiteInput } from "./content";
import { renderEmailHtml, renderEmailText } from "./templates";
import { EmailPayloadError } from "./payload-errors";
import type { EmailSendInput } from "../../integrations/email/provider";

// Local, safe-by-default dev convenience -- mirrors this codebase's own
// AI_PROVIDER/EMAIL_PROVIDER "unset defaults to a safe dev value, never a
// silent production fallback" discipline (Stage 16.7, reapplied in Stage
// 17.1). Matches the frontend's own actual local dev port (Stage 16.9's
// own inspection confirmed the Next.js client runs on :3000 in dev).
const DEFAULT_DEV_APP_BASE_URL = "http://localhost:3000";

// Stage 17.4 §21/§22: resolves + validates APP_BASE_URL, returning a
// normalized origin+path with any trailing slash stripped, or null when
// no safe value is available. Never throws -- a missing/invalid base URL
// means "omit the action link" (templates.ts), not "fail the whole
// payload" (Stage 17.4 §28 reserves EmailPayloadError for missing
// recipient/website data only, not for this).
//
// Production parity with Stage 16.7's own NODE_ENV policy: only an UNSET
// value falls back to the local dev default, and only when NOT in
// production -- an unset APP_BASE_URL in production returns null rather
// than silently emitting a `localhost:3000` link in a real email, which
// would be exactly the "silently generate a broken link" outcome Stage
// 17.4 §21 forbids. An EXPLICITLY set but invalid value (bad protocol,
// embedded credentials, unparseable) always returns null regardless of
// environment -- it is never worth silently falling back to localhost
// for a value someone deliberately set.
export function resolveAppBaseUrl(): string | null {
  const raw = process.env.APP_BASE_URL?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!raw) {
    return isProduction ? null : DEFAULT_DEV_APP_BASE_URL;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // Only http(s) -- never javascript:/data:/file: (Stage 17.4 §17/§22).
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  // No embedded credentials (Stage 17.4 §22/§24) -- a base URL is
  // application configuration, never a per-user secret-bearing value.
  if (parsed.username || parsed.password) {
    return null;
  }

  // Normalize: origin + pathname only (drop search/hash, which have no
  // meaning for a base URL), trailing slash(es) stripped so
  // `${base}/websites/{id}` can never produce a doubled "//".
  const normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
  return normalized;
}

export interface BuildEmailPayloadInput {
  // Stage 17.2's EmailDelivery.id -- the sole idempotency-key source
  // (Stage 17.4 §25), never a newly-generated value.
  deliveryId: string;
  websiteId: string;
  alert: EmailTemplateAlertInput;
  website: EmailTemplateWebsiteInput;
  user: {
    email: string;
  };
}

// Stage 17.4's one public entry point. Pure/deterministic given its
// input -- no Prisma, no Date.now()/Math.random() (content.ts derives
// everything from alert.createdAt), no network, no provider call. Takes
// already-loaded plain data (Stage 17.4 §5) -- orchestration/data-loading
// is Stage 17.5's responsibility, not this module's.
//
// Reuses integrations/email/provider.ts's own EmailSendInput as the
// return type directly (Stage 17.4 §4) rather than declaring a
// near-duplicate EmailNotificationPayload type -- every field this
// builder produces (to/subject/html/text/idempotencyKey) is always
// present, which already satisfies that interface's optional fields.
export function buildEmailPayload(input: BuildEmailPayloadInput): EmailSendInput {
  const to = input.user.email.trim();
  if (to.length === 0) {
    throw new EmailPayloadError("MISSING_DATA", "Recipient email is missing.");
  }

  if (!input.website.url || input.website.url.trim().length === 0) {
    throw new EmailPayloadError("MISSING_DATA", "Website URL is missing.");
  }

  // Exhaustive over all six AlertTypes (content.ts) -- throws
  // EmailPayloadError("UNSUPPORTED_ALERT_TYPE", ...) before ever reaching
  // a provider call if somehow given an AlertType this stage doesn't
  // know how to render (Stage 17.4 §29).
  const content = buildEmailEventContent(input.alert, input.website);

  const actionUrl = (() => {
    const base = resolveAppBaseUrl();
    return base ? `${base}/websites/${input.websiteId}` : null;
  })();

  const html = renderEmailHtml(content, { actionUrl });
  const text = renderEmailText(content, { actionUrl });

  return {
    to,
    subject: content.subjectLine,
    html,
    text,
    // Deterministic, bounded, ASCII-only, contains no secret/email
    // address/timestamp -- the installed Resend SDK's own
    // IdempotentRequest.idempotencyKey is documented only as "forwarded
    // as the Idempotency-Key header" with no further length/charset
    // constraint (verified directly in node_modules/resend/dist/
    // index.d.mts), so this format is a conservative, safe choice rather
    // than one dictated by an undocumented provider limit.
    idempotencyKey: `sentinel-email-${input.deliveryId}`,
  };
}
