// Stage 17.1: the provider-independent boundary. Domain/business code
// (Stage 17.3's future Alert->EmailDelivery wiring, Stage 17.5's future
// worker) must depend only on this interface -- never a Resend SDK type,
// a `CreateEmailOptions` shape, or any other vendor-specific object.
// Mirrors this codebase's existing integration-boundary precedent
// (integrations/ai/provider.ts's AiProvider -- a plain interface with no
// Prisma/Express/Alert/Notification/React types anywhere near it).
//
// Sender identity (from/fromName) is deliberately NOT part of this input --
// for Sentinel AI, the sending address/display name is application
// configuration (EMAIL_FROM/EMAIL_FROM_NAME), not domain-event data that
// varies per call. Every future caller only ever supplies what actually
// varies per email: recipient, content, and an optional idempotency key.
export interface EmailSendInput {
  to: string;
  subject: string;
  html: string;
  // Optional plain-text fallback part -- Stage 17.4 (templates) decides
  // whether to always supply one; this contract merely allows it.
  text?: string;
  // Forwarded to the provider's own idempotency mechanism if it has one
  // (see resend-provider.ts) -- NOT generated here. A future
  // EmailDelivery.id (Stage 17.2) is the expected value a caller will
  // eventually pass; this stage invents nothing and persists nothing.
  idempotencyKey?: string;
}

export interface EmailSendResult {
  // The provider's own identifier for this specific send -- opaque to
  // domain code, persisted later (Stage 17.2) purely for traceability/
  // observability, never parsed or relied upon for business logic.
  providerMessageId: string;
}

export interface EmailProvider {
  readonly name: string;

  // Always resolves to an EmailSendResult or rejects with an
  // EmailProviderError -- never returns a raw SDK response object, and
  // never silently swallows a provider-reported failure as success.
  send(input: EmailSendInput): Promise<EmailSendResult>;
}
