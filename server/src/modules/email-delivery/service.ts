import { prisma } from "../../config/prisma";
import { emailDeliveryRepository } from "./repository";
import { resolveEmailProviderName } from "../../integrations/email/factory";

export type CreateEmailIntentForAlertResult =
  | { outcome: "CREATED"; deliveryId: string }
  | { outcome: "ALREADY_EXISTS" }
  | { outcome: "SKIPPED_DISABLED" }
  | { outcome: "SKIPPED_CONFIGURATION_ERROR" };

// Stage 17.3 §7: the ONE shared boundary every Alert-producing domain
// (Uptime/SEO/Performance) calls through -- mirrors
// notificationRepository.createForAlert's own "one shared repository-
// level primitive, not three duplicated implementations" precedent
// exactly. No Uptime/SEO/Performance-specific logic lives here or at any
// of its call sites; this function only ever needs an alertId and a
// userId.
//
// Takes a Prisma client/transaction handle rather than owning a
// transaction itself (Stage 17.3 §8) -- the caller's own domain
// transaction (the SAME one that already creates the Alert and calls
// notificationRepository.createForAlert) is expected to pass its `tx`
// here, so Alert + IN_APP Notification + EmailDelivery intent all commit
// or roll back together as one atomic unit. This function never calls
// $transaction itself.
export async function createEmailIntentForAlert(
  client: Pick<typeof prisma, "emailDelivery" | "user">,
  input: { alertId: string; userId: string }
): Promise<CreateEmailIntentForAlertResult> {
  const recipient = await client.user.findUnique({
    where: { id: input.userId },
    select: { emailNotificationsEnabled: true },
  });

  // Fails CLOSED (skips) if the user row is somehow missing -- the
  // deliberate OPPOSITE choice from notificationRepository.createForAlert,
  // which fails OPEN for the identical missing-row edge case. IN_APP has
  // no external cost, so "never silently drop a delivery record" is the
  // safer default there; EMAIL has a real external-provider cost once
  // Stage 17.5 exists, and a missing User row means there is no
  // User.email to ever send to regardless, so creating a PENDING intent
  // that could never be fulfilled would be pointless at best. In
  // practice unreachable -- input.userId always comes from an
  // already-loaded website.userId at the caller -- so this is a
  // defensive, documented choice, not an expected path.
  if (!recipient || !recipient.emailNotificationsEnabled) {
    return { outcome: "SKIPPED_DISABLED" };
  }

  // Stage 17.3 §9/§10/§21: resolves the configured provider's NAME only --
  // never constructs/calls a provider, never requires RESEND_API_KEY/
  // EMAIL_FROM to be set. A configuration problem (unset in production,
  // or an unrecognized EMAIL_PROVIDER value) is an email-infrastructure
  // concern, isolated here and reported as SKIPPED_CONFIGURATION_ERROR --
  // it must never propagate as a thrown error that would roll back the
  // surrounding Alert transaction (Stage 17.3 §11/§12, category B).
  const providerSelection = resolveEmailProviderName();
  if (!providerSelection.ok) {
    // Safe to log: alertId/userId are opaque ids, and the message is
    // resolveEmailProviderName's own curated, secret-free string (it can
    // only ever be one of the two fixed messages in
    // integrations/email/factory.ts -- never a raw env value, API key, or
    // stack trace).
    console.error(
      `Email intent skipped due to email provider configuration (alert ${input.alertId}, user ${input.userId}): ${providerSelection.message}`
    );
    return { outcome: "SKIPPED_CONFIGURATION_ERROR" };
  }

  // A genuine, unexpected Prisma/database error from createIntent (Stage
  // 17.3 §12/§17, category A) is deliberately NOT caught here -- it
  // propagates to the caller's own transaction exactly like any other
  // write failure (e.g. tx.alert.create itself failing) would, correctly
  // rolling back the whole Alert transaction. Only the expected P2002
  // dedup collision is handled, by emailDeliveryRepository.createIntent
  // itself (Stage 17.2), never re-implemented here.
  const result = await emailDeliveryRepository.createIntent(client, {
    alertId: input.alertId,
    userId: input.userId,
    provider: providerSelection.name,
  });

  if (result.outcome === "ALREADY_EXISTS") {
    return { outcome: "ALREADY_EXISTS" };
  }

  return { outcome: "CREATED", deliveryId: result.delivery.id };
}
