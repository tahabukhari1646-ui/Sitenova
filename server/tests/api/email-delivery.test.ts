// Stage 19.2: email intents and delivery -- user settings respected, one
// email per alert, claim-before-send, and safe failures. Mock provider only;
// a Resend row can only reach the "not configured" path (no key exists).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { createEmailIntentForAlert } from "../../src/modules/email-delivery/service";
import { processEmailDelivery } from "../../src/modules/email-delivery/worker";
import { runEmailDeliveryCycle } from "../../src/modules/email-delivery/scheduler";
import { notificationRepository } from "../../src/modules/notification/repository";
import { createUser, createWebsite, disconnectDatabase } from "../helpers/factories";
import { assertNoExternalRequests, withEnv } from "../helpers/safety";

async function userWith(settings: { inApp?: boolean; email?: boolean } = {}) {
  const user = await createUser("email");
  return prisma.user.update({
    where: { id: user.id },
    data: { inAppNotificationsEnabled: settings.inApp ?? true, emailNotificationsEnabled: settings.email ?? true },
  });
}

async function alertFor(userId: string, name = "Email test site") {
  const website = await createWebsite(userId, { name });
  const incident = await prisma.incident.create({ data: { websiteId: website.id, status: "OPEN", startedAt: new Date() } });
  return prisma.alert.create({
    data: { websiteId: website.id, incidentId: incident.id, type: "INCIDENT_OPENED", source: "UPTIME", severity: "ERROR" },
  });
}

async function pendingDelivery(provider = "mock") {
  const user = await userWith();
  const alert = await alertFor(user.id);
  return prisma.emailDelivery.create({ data: { alertId: alert.id, userId: user.id, status: "PENDING", provider } });
}

describe("email delivery", () => {
  let consoleError: typeof console.error;
  const errors: string[] = [];

  before(() => {
    consoleError = console.error;
    console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  });
  after(async () => {
    console.error = consoleError;
    await disconnectDatabase();
  });

  describe("creating intents", () => {
    it("creates one PENDING intent when the user has email on", async () => {
      const user = await userWith({ email: true });
      const alert = await alertFor(user.id);
      const result = await createEmailIntentForAlert(prisma, { alertId: alert.id, userId: user.id });
      assert.equal(result.outcome, "CREATED");
      const row = await prisma.emailDelivery.findFirstOrThrow({ where: { alertId: alert.id } });
      assert.equal(row.status, "PENDING");
      assert.equal(row.provider, "mock");
    });

    it("skips users who turned email off", async () => {
      const user = await userWith({ email: false });
      const alert = await alertFor(user.id);
      assert.deepEqual(await createEmailIntentForAlert(prisma, { alertId: alert.id, userId: user.id }), { outcome: "SKIPPED_DISABLED" });
      assert.equal(await prisma.emailDelivery.count({ where: { alertId: alert.id } }), 0);
    });

    it("never creates two emails for the same alert, even 5 at once", async () => {
      const user = await userWith();
      const alert = await alertFor(user.id);
      const outcomes = await Promise.all(
        Array.from({ length: 5 }, () => createEmailIntentForAlert(prisma, { alertId: alert.id, userId: user.id }))
      );
      assert.equal(outcomes.filter((o) => o.outcome === "CREATED").length, 1, JSON.stringify(outcomes));
      assert.equal(outcomes.filter((o) => o.outcome === "ALREADY_EXISTS").length, 4);
      assert.equal(await prisma.emailDelivery.count({ where: { alertId: alert.id } }), 1);
    });

    it("a misconfigured email provider skips the email without breaking the alert", async () => {
      const user = await userWith();
      const alert = await alertFor(user.id);
      const result = await withEnv({ EMAIL_PROVIDER: "carrier-pigeon" }, () =>
        createEmailIntentForAlert(prisma, { alertId: alert.id, userId: user.id })
      );
      assert.equal(result.outcome, "SKIPPED_CONFIGURATION_ERROR");
      assert.equal(await prisma.emailDelivery.count({ where: { alertId: alert.id } }), 0);
      assert.ok(await prisma.alert.findUnique({ where: { id: alert.id } }), "the alert still exists");
    });
  });

  describe("in-app notifications", () => {
    it("are created when on and skipped when the user turned them off", async () => {
      const on = await userWith({ inApp: true });
      const off = await userWith({ inApp: false });
      const alertOn = await alertFor(on.id);
      const alertOff = await alertFor(off.id);
      assert.ok(await notificationRepository.createForAlert(prisma, { alertId: alertOn.id, userId: on.id }));
      assert.equal(await notificationRepository.createForAlert(prisma, { alertId: alertOff.id, userId: off.id }), null);
      assert.equal(await prisma.notification.count({ where: { userId: off.id } }), 0);
    });
  });

  describe("sending", () => {
    it("sends a PENDING email once through the mock and records SENT", async () => {
      const delivery = await pendingDelivery();
      assert.equal(await processEmailDelivery(delivery.id), "SENT");
      const row = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
      assert.equal(row.status, "SENT");
      assert.match(row.providerMessageId ?? "", /^mock-email-/);
      assert.ok(row.claimedAt && row.sentAt);
      assert.equal(await processEmailDelivery(delivery.id), "NOT_CLAIMED", "never sent twice");
    });

    it("5 workers racing for one email: exactly one sends it", async () => {
      const delivery = await pendingDelivery();
      const outcomes = await Promise.all(Array.from({ length: 5 }, () => processEmailDelivery(delivery.id)));
      assert.equal(outcomes.filter((o) => o === "SENT").length, 1, outcomes.join(","));
      assert.equal(outcomes.filter((o) => o === "NOT_CLAIMED").length, 4);
    });

    it("Resend without a key fails safely: FAILED with CONFIGURATION_ERROR, no network", async () => {
      const delivery = await pendingDelivery("resend");
      assert.equal(await processEmailDelivery(delivery.id), "FAILED");
      const row = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
      assert.equal(row.status, "FAILED");
      assert.equal(row.lastErrorCode, "CONFIGURATION_ERROR");
      assert.equal(row.providerMessageId, null);
      assertNoExternalRequests();
    });

    it("an unknown stored provider fails with UNKNOWN_PROVIDER", async () => {
      const delivery = await pendingDelivery("carrier-pigeon");
      assert.equal(await processEmailDelivery(delivery.id), "FAILED");
      assert.equal((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).lastErrorCode, "UNKNOWN_PROVIDER");
    });

    it("the delivery cycle sends pending emails and reports a summary", async () => {
      const delivery = await pendingDelivery();
      const logs: string[] = [];
      const consoleLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
      try {
        await runEmailDeliveryCycle();
      } finally {
        console.log = consoleLog;
      }
      assert.equal((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status, "SENT");
      assert.ok(logs.some((line) => line.startsWith("Email delivery cycle complete:")), logs.join("\n"));
    });
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
