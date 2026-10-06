import { Resend } from "resend";
import type { ErrorResponse } from "resend";
import { EmailProviderError } from "./errors";
import type { EmailProvider, EmailSendInput, EmailSendResult } from "./provider";

// A real transactional email is expected to complete in well under a
// second in the normal case -- 10s leaves comfortable headroom over a
// slow network without letting a single send hang indefinitely (mirrors
// integrations/ai/openai-provider.ts's own "bounded, not unbounded"
// reasoning for its own ANALYSIS_TIMEOUT_MS, scaled down for a much
// smaller request/response payload).
const SEND_TIMEOUT_MS = 10_000;

// Stage 17.1 §18: ZERO application-level retries here. The Resend SDK
// itself (inspected directly in node_modules/resend/dist/index.d.mts) has
// no built-in automatic-retry option exposed anywhere in its public
// surface -- `post()`/`emails.send()` perform exactly one HTTP request
// each, so there is no implicit SDK retry behavior to disable or inherit.

// Maps a REJECTED/thrown error (network failure, DNS failure, or our own
// AbortSignal.timeout() firing) -- distinct from an API-level error, which
// Resend returns as a normal resolved `{ error }` response instead of
// throwing (see mapResendApiError below). Deliberately forwards only
// `error.message` for the generic fallback branch (a short, Node/fetch-
// authored string) -- never the full error object, never headers, never
// request config -- so an Authorization header or key can never leak
// through this boundary (Stage 17.1 §24, mirrors mapOpenAiError's own
// identical discipline).
function mapResendTransportError(error: unknown): EmailProviderError {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new EmailProviderError("TIMEOUT", "The email provider did not respond in time.");
  }
  return new EmailProviderError(
    "PROVIDER_UNAVAILABLE",
    error instanceof Error ? error.message : "The email provider request failed for an unknown reason."
  );
}

// Maps Resend's own API-level ErrorResponse.name (the exact
// RESEND_ERROR_CODE_KEY union inspected directly from the installed SDK's
// type definitions, not guessed) into this integration's small taxonomy.
// Deliberately uses only the fixed, curated message per category below --
// never ErrorResponse.message itself -- so no provider-authored text ever
// reaches a caller unreviewed.
//
// No RECIPIENT_REJECTED mapping exists here by design (see errors.ts's own
// doc comment) -- none of Resend's synchronous error codes represent "the
// recipient's mailbox rejected this."
function mapResendApiError(error: ErrorResponse): EmailProviderError {
  switch (error.name) {
    case "missing_api_key":
    case "invalid_api_key":
    case "restricted_api_key":
    case "invalid_from_address":
    case "invalid_region":
      return new EmailProviderError(
        "CONFIGURATION_ERROR",
        "The configured email provider settings were rejected."
      );
    case "rate_limit_exceeded":
    case "monthly_quota_exceeded":
    case "daily_quota_exceeded":
      return new EmailProviderError("RATE_LIMIT", "The email provider is rate-limiting requests.");
    case "validation_error":
    case "missing_required_field":
    case "invalid_parameter":
    case "invalid_attachment":
    case "invalid_idempotency_key":
    case "invalid_idempotent_request":
    case "not_found":
    case "method_not_allowed":
    case "invalid_access":
      return new EmailProviderError("INVALID_REQUEST", "The email request was rejected as invalid.");
    case "concurrent_idempotent_requests":
    case "security_error":
    case "application_error":
    case "internal_server_error":
      return new EmailProviderError(
        "PROVIDER_UNAVAILABLE",
        "The email provider is temporarily unavailable."
      );
    default:
      // Forward-compatible: a future Resend error code this taxonomy
      // doesn't yet know about fails safe to UNKNOWN_PROVIDER_ERROR rather
      // than crashing or being silently miscategorized.
      return new EmailProviderError(
        "UNKNOWN_PROVIDER_ERROR",
        "The email provider returned an unrecognized error."
      );
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly fromName: string;

  constructor(fromName: string) {
    this.fromName = fromName;
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    // Checked here, at call time, not at provider construction -- the
    // server must start normally with no Resend configuration present
    // (Stage 17.1 §11), exactly the same lazy-check discipline
    // integrations/ai/openai-provider.ts already uses for
    // OPENAI_API_KEY/integrations/pagespeed.ts uses for
    // PAGESPEED_API_KEY.
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new EmailProviderError("CONFIGURATION_ERROR", "RESEND_API_KEY is not configured.");
    }

    const from = process.env.EMAIL_FROM;
    if (!from) {
      throw new EmailProviderError("CONFIGURATION_ERROR", "EMAIL_FROM is not configured.");
    }

    const client = new Resend(apiKey);

    let response;
    try {
      response = await client.emails.send(
        {
          from: `${this.fromName} <${from}>`,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        },
        {
          // Resend's own documented idempotency mechanism -- forwarded as
          // the `Idempotency-Key` header by the SDK itself (verified in
          // node_modules/resend/dist/index.d.mts's IdempotentRequest
          // interface), never invented/generated here (Stage 17.1 §14:
          // no EmailDelivery id exists yet to derive one from).
          idempotencyKey: input.idempotencyKey,
          // Bounded timeout via the SDK's own supported `signal` request
          // option (RequestOptions.signal: AbortSignal) -- verified
          // directly in the installed SDK's types, not invented.
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        }
      );
    } catch (error) {
      throw mapResendTransportError(error);
    }

    if (response.error) {
      throw mapResendApiError(response.error);
    }

    if (!response.data?.id) {
      throw new EmailProviderError(
        "UNKNOWN_PROVIDER_ERROR",
        "The email provider did not return a message id."
      );
    }

    return { providerMessageId: response.data.id };
  }
}
