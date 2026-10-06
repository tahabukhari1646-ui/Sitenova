// Stage 17.1: mirrors integrations/ai/errors.ts's AiProviderError pattern
// exactly -- a plain Error (not AppError) with a `code` discriminator,
// because a future caller (Stage 17.5's worker) will want to react very
// differently per category (e.g. never retry CONFIGURATION_ERROR, but
// retry RATE_LIMIT/PROVIDER_UNAVAILABLE later) -- this generic integration
// boundary does not hardcode any HTTP status or retry decision itself.
//
// This taxonomy is deliberately small and built from what Resend's actual
// API can distinguish (see resend-provider.ts's own mapping comment) --
// not from an imagined ideal error model. In particular, no
// RECIPIENT_REJECTED/INVALID_EMAIL category exists: Resend's synchronous
// send() response cannot safely distinguish "the recipient's mailbox
// rejected this" from a generic validation failure -- true bounce/
// complaint events are only available later via Resend's async webhook
// events, which are explicitly out of Stage 17.1's scope.
export type EmailProviderErrorCode =
  // Missing/invalid/restricted API key, invalid sender/region -- anything
  // only the operator's own configuration can fix. Authentication
  // failures are folded into this category rather than a separate
  // AUTHENTICATION_ERROR code, mirroring AiProviderError's own precedent
  // (OpenAI's AuthenticationError maps to CONFIGURATION_ERROR too).
  | "CONFIGURATION_ERROR"
  // The request itself was malformed (bad parameter, missing required
  // field, invalid idempotency key reuse, etc.) -- a bug in how this
  // codebase called the provider, not a transient condition.
  | "INVALID_REQUEST"
  // Resend-reported rate limiting or quota exhaustion.
  | "RATE_LIMIT"
  // The request did not complete within the configured timeout.
  | "TIMEOUT"
  // Network failure, or a provider-side failure not safely attributable
  // to any more specific category above (internal server error,
  // application error, a concurrent-idempotent-request conflict, etc.).
  | "PROVIDER_UNAVAILABLE"
  // The provider responded successfully but in a shape this integration
  // did not expect (e.g. a success response with no message id) --
  // distinct from PROVIDER_UNAVAILABLE, which is a reported failure.
  | "UNKNOWN_PROVIDER_ERROR";

export class EmailProviderError extends Error {
  code: EmailProviderErrorCode;

  constructor(code: EmailProviderErrorCode, message: string) {
    super(message);
    this.name = "EmailProviderError";
    this.code = code;
  }
}
