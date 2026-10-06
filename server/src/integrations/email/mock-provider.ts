import { createHash } from "node:crypto";
import type { EmailProvider, EmailSendInput, EmailSendResult } from "./provider";

// Stage 17.1: a deterministic, zero-network EmailProvider implementation --
// mirrors integrations/ai/mock-provider.ts's MockAiProvider discipline
// exactly: implements the EXACT SAME interface as the real provider (so
// future Stage 17.2+ code can never tell them apart), is a pure function
// of its input only (no Date.now(), no Math.random(), no network, no
// environment reads), and the same EmailSendInput always produces the
// same EmailSendResult.
//
// The "mock-email-" prefix is load-bearing, not cosmetic -- it is the one
// thing that makes the returned providerMessageId impossible to confuse
// with a real Resend message id (which never has this shape), so no
// future code path could accidentally treat a mock send as if an actual
// external email had been delivered.
export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    // Canonical, fixed-key-order serialization (same discipline as
    // ai-analysis/fingerprint.ts) -- JSON.stringify on a literal object
    // preserves declaration order, so field order can never accidentally
    // change the derived id.
    const canonical = JSON.stringify({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 24);

    return { providerMessageId: `mock-email-${hash}` };
  }
}
