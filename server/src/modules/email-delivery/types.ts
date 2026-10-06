// Stage 17.2: persistence-only contracts. No controller/routes exist for
// this module (Stage 17.2 §14) -- there is no public EmailDelivery API,
// and none of these types are ever exposed to the frontend.

export { EmailDeliveryStatus } from "../../generated/prisma/client";
import type { EmailDelivery } from "../../generated/prisma/client";

export interface CreateEmailDeliveryIntentInput {
  alertId: string;
  userId: string;
  provider: string;
}

// Deliberately NOT a thrown-exception boundary for the expected dedup
// collision case (Stage 17.2 §16) -- ALREADY_EXISTS is a normal, expected
// outcome (e.g. a retried Alert-creation transaction), not a 500.
export type CreateEmailDeliveryIntentResult =
  | { outcome: "CREATED"; delivery: EmailDelivery }
  | { outcome: "ALREADY_EXISTS" };

export type ClaimEmailDeliveryResult =
  | { outcome: "CLAIMED"; delivery: EmailDelivery }
  | { outcome: "NOT_CLAIMED" };

export interface FinalizeSuccessInput {
  providerMessageId: string;
}

export type FinalizeSuccessResult =
  | { outcome: "FINALIZED"; delivery: EmailDelivery }
  | { outcome: "NOT_FINALIZED" };

export interface FinalizeFailureInput {
  // A sanitized EmailProviderError.code value (Stage 17.1's own small
  // taxonomy) -- this module has no dependency on integrations/email/* and
  // does not import that type, so the caller is responsible for already
  // having sanitized it (Stage 17.5's future concern).
  lastErrorCode: string;
}

export type FinalizeFailureResult =
  | { outcome: "FINALIZED"; delivery: EmailDelivery }
  | { outcome: "NOT_FINALIZED" };
