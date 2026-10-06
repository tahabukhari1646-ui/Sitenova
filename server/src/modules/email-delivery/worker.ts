import { prisma } from "../../config/prisma";
import { emailDeliveryRepository } from "./repository";
import { buildEmailPayload } from "./payload";
import { EmailPayloadError } from "./payload-errors";
import { getEmailProviderByName } from "../../integrations/email/factory";
import { EmailProviderError } from "../../integrations/email/errors";

export type ProcessEmailDeliveryResult = "SENT" | "FAILED" | "NOT_CLAIMED";

// Only the two names createEmailIntentForAlert (Stage 17.3) ever writes.
// Checked here, before any provider resolution, so an out-of-band/
// corrupted value persists the more specific UNKNOWN_PROVIDER code rather
// than falling through to integrations/email/factory.ts's generic
// CONFIGURATION_ERROR fallback (Stage 17.5 §16/§32).
const KNOWN_PROVIDER_NAMES = new Set(["mock", "resend"]);

async function finalizeAsFailure(deliveryId: string, lastErrorCode: string): Promise<"FAILED"> {
  const result = await emailDeliveryRepository.finalizeFailure(deliveryId, { lastErrorCode });
  if (result.outcome !== "FINALIZED") {
    // Stage 17.5 §18: the conditional UPDATE found the row was no longer
    // SENDING by the time this ran -- logged, never papered over. This
    // process is the only one holding the claim, so this should be
    // unreachable in practice; if it ever happens, the row may remain
    // stuck SENDING (the same accepted V1 limitation as an unfinalized
    // crash -- see module doc below), which is safer than falsely
    // reporting a failure that didn't actually persist.
    console.error(
      `Email delivery ${deliveryId}: finalizeFailure did not apply (row no longer SENDING).`
    );
  }
  return "FAILED";
}

// Stage 17.5: processes exactly ONE claimed delivery, end to end. This is
// the ONLY function in this codebase allowed to call provider.send() for
// email (Stage 17.5 §1/§13).
//
// Claim-before-send is the entire concurrency boundary (Stage 17.5 §8/§9)
// -- emailDeliveryRepository.claimDelivery's atomic conditional UPDATE
// (Stage 17.2) is what a JS-level guard in scheduler.ts can never replace;
// NOT_CLAIMED means another process/call already owns this delivery, and
// this function returns immediately with zero provider calls.
//
// Stuck-SENDING V1 limitation (Stage 17.2 §23, reaffirmed unchanged here
// per Stage 17.5 §19): if this process crashes after a successful claim
// but before finalizeSuccess/finalizeFailure commits, the row remains
// SENDING forever. No lease, timeout, reset, or sweeper is implemented --
// a stuck SENDING row is strictly preferable to risking a duplicate
// external send with an unknown provider outcome.
export async function processEmailDelivery(deliveryId: string): Promise<ProcessEmailDeliveryResult> {
  const claim = await emailDeliveryRepository.claimDelivery(deliveryId);
  if (claim.outcome === "NOT_CLAIMED") {
    return "NOT_CLAIMED";
  }

  const delivery = claim.delivery;

  // Stage 17.5 §7: the minimum data Stage 17.4's buildEmailPayload
  // actually needs -- Alert (+ its Website, via the existing
  // Alert.website relation) and the recipient User's email. No
  // AiAnalysis/SeoCheck/PerformanceCheck/MonitoringCheck join -- Stage
  // 17.4's own inspection confirmed Alert's own `code`/`message` fields
  // already carry everything its templates need.
  const [alert, user] = await Promise.all([
    prisma.alert.findUnique({
      where: { id: delivery.alertId },
      select: {
        type: true,
        severity: true,
        code: true,
        message: true,
        createdAt: true,
        website: { select: { id: true, name: true, url: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: delivery.userId }, select: { email: true } }),
  ]);

  // Structurally near-unreachable (Alert/User both Cascade-delete their
  // EmailDelivery rows -- Stage 17.2 §43 verified this directly), but
  // handled explicitly rather than assumed impossible (Stage 17.5 §31).
  if (!alert || !alert.website || !user) {
    return finalizeAsFailure(delivery.id, "MISSING_DATA");
  }

  let payload;
  try {
    payload = buildEmailPayload({
      deliveryId: delivery.id,
      websiteId: alert.website.id,
      alert: {
        type: alert.type,
        severity: alert.severity,
        code: alert.code,
        message: alert.message,
        createdAt: alert.createdAt,
      },
      website: { name: alert.website.name, url: alert.website.url },
      user: { email: user.email },
    });
  } catch (error) {
    // Only Stage 17.4's own sanitized payload-generation failure is
    // isolated here (Stage 17.5 §15/§17) -- its `.code` (MISSING_DATA /
    // UNSUPPORTED_ALERT_TYPE) is reused verbatim as lastErrorCode, never
    // re-derived. Any OTHER thrown error is an unexpected programming
    // failure and must propagate, not be disguised as a delivery failure.
    if (error instanceof EmailPayloadError) {
      return finalizeAsFailure(delivery.id, error.code);
    }
    throw error;
  }

  if (!KNOWN_PROVIDER_NAMES.has(delivery.provider)) {
    return finalizeAsFailure(delivery.id, "UNKNOWN_PROVIDER");
  }

  // Stage 17.5 §4: resolved from the DELIVERY ROW'S OWN recorded
  // provider, never from the current environment's EMAIL_PROVIDER --
  // getEmailProviderByName never consults process.env.EMAIL_PROVIDER at
  // all (verified in integrations/email/factory.ts).
  const provider = getEmailProviderByName(delivery.provider);

  try {
    // The ONE provider.send() call for this delivery (Stage 17.5 §13) --
    // payload.idempotencyKey is passed through completely unchanged from
    // Stage 17.4's own deterministic `sentinel-email-{deliveryId}` value,
    // never regenerated here (Stage 17.5 §12).
    const result = await provider.send(payload);

    const finalized = await emailDeliveryRepository.finalizeSuccess(delivery.id, {
      providerMessageId: result.providerMessageId,
    });
    if (finalized.outcome !== "FINALIZED") {
      // The provider has ALREADY sent at this point -- this can only mean
      // the row left SENDING through some other path, which should be
      // unreachable (this process holds the only claim). Logged, not
      // silently ignored; we cannot un-send, so there is nothing else
      // safe to do here.
      console.error(
        `Email delivery ${delivery.id}: provider.send succeeded but finalizeSuccess did not apply (row no longer SENDING).`
      );
    }
    return "SENT";
  } catch (error) {
    // Only Stage 17.1's own sanitized EmailProviderError taxonomy is
    // isolated here (Stage 17.5 §15/§16/§17) -- its `.code` (
    // CONFIGURATION_ERROR / INVALID_REQUEST / RATE_LIMIT / TIMEOUT /
    // PROVIDER_UNAVAILABLE / UNKNOWN_PROVIDER_ERROR) is reused verbatim,
    // never a raw Error.message/stack trace. Any OTHER thrown error
    // (e.g. a genuine database failure from finalizeSuccess's own write)
    // is NOT a provider failure and must propagate uncaught, never
    // disguised as FAILED (Stage 17.5 §17/§18).
    if (error instanceof EmailProviderError) {
      return finalizeAsFailure(delivery.id, error.code);
    }
    throw error;
  }
}
