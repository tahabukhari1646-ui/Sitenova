// Stage 17.4 §28/§29: a narrow, sanitized failure boundary for payload
// GENERATION, distinct from integrations/email/errors.ts's EmailProviderError
// (which is a provider/network/send-time concern this stage never touches).
// A caller (Stage 17.5's future worker) can distinguish "this delivery's
// content could not be built" from "the provider rejected/failed the
// send" by catching this specific type.
export type EmailPayloadErrorCode =
  // Required input (recipient email, website URL) was missing/empty --
  // the builder refuses to fabricate a placeholder "to"/"subject" and
  // continue (Stage 17.4 §28's explicit "do not return to=''" rule).
  | "MISSING_DATA"
  // An AlertType reached the content mapping that this exhaustive switch
  // does not (yet) handle -- see content.ts's own default branch. Should
  // be unreachable given TypeScript's exhaustiveness check over the
  // current six AlertType values; this only fires if a new AlertType is
  // added to the schema without updating content.ts.
  | "UNSUPPORTED_ALERT_TYPE";

export class EmailPayloadError extends Error {
  code: EmailPayloadErrorCode;

  constructor(code: EmailPayloadErrorCode, message: string) {
    super(message);
    this.name = "EmailPayloadError";
    this.code = code;
  }
}
