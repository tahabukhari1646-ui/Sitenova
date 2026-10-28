// Stage 19.2: the notification inbox and the Settings page -- both are
// per-user, and nobody can read or change another user's data.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { createUser, createWebsite, disconnectDatabase } from "../helpers/factories";
import { startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { assertNoExternalRequests } from "../helpers/safety";

async function notificationsFor(userId: string, count: number) {
  const website = await createWebsite(userId);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const alert = await prisma.alert.create({
      data: { websiteId: website.id, type: "SEO_ISSUE_OPENED", source: "SEO", severity: "WARNING", code: `CODE_${i}` },
    });
    ids.push((await prisma.notification.create({ data: { alertId: alert.id, userId, channel: "IN_APP" } })).id);
  }
  return ids;
}

describe("notifications", () => {
  let api: TestServer;
  let token: string;
  let strangerToken: string;
  let ids: string[];
  let strangerIds: string[];

  before(async () => {
    api = await startTestServer();
    const user = await createUser("inbox");
    const stranger = await createUser("inbox-stranger");
    token = tokenFor(user);
    strangerToken = tokenFor(stranger);
    ids = await notificationsFor(user.id, 3);
    strangerIds = await notificationsFor(stranger.id, 2);
  });
  after(async () => {
    await api.close();
  });

  const list = (status = "") => api.request("GET", `/notifications${status ? `?status=${status}` : ""}`, { token });

  it("lists only my notifications with alert and website details", async () => {
    const res = await list();
    assert.equal(res.status, 200);
    assert.equal(res.json.total, 3);
    assert.equal(res.json.unread, 3);
    assert.equal(res.json.truncated, false);
    assert.ok(res.json.notifications.every((n: { id: string }) => ids.includes(n.id)));
    assert.equal(res.json.notifications[0].alert.website.name, "Test site");
  });

  it("marks one as read, idempotently", async () => {
    const first = await api.request("PATCH", `/notifications/${ids[0]}/read`, { token });
    assert.equal(first.status, 200);
    assert.ok(first.json.notification.readAt);
    const again = await api.request("PATCH", `/notifications/${ids[0]}/read`, { token });
    assert.equal(again.json.notification.readAt, first.json.notification.readAt, "the first read time is kept");

    assert.equal((await list("READ")).json.total, 1);
    assert.equal((await list("UNREAD")).json.total, 2);
    assert.equal((await list()).json.unread, 2);
    assert.equal((await list("unread")).status, 400);
  });

  it("marks all as read, without touching other users", async () => {
    const res = await api.request("PATCH", "/notifications/read-all", { token });
    assert.equal(res.json.updated, 2);
    assert.equal((await list()).json.unread, 0);
    assert.equal(await prisma.notification.count({ where: { id: { in: strangerIds }, readAt: { not: null } } }), 0);
  });

  it("can never read or mark another user's notification", async () => {
    assert.equal((await api.request("PATCH", `/notifications/${strangerIds[0]}/read`, { token })).status, 404);
    assert.equal((await prisma.notification.findUniqueOrThrow({ where: { id: strangerIds[0] } })).readAt, null);
    const strangerList = await api.request("GET", "/notifications", { token: strangerToken });
    assert.ok(strangerList.json.notifications.every((n: { id: string }) => strangerIds.includes(n.id)));
    assert.equal((await api.request("GET", "/notifications")).status, 401);
  });
});

describe("settings", () => {
  let api: TestServer;
  let userId: string;
  let token: string;

  before(async () => {
    api = await startTestServer();
    const user = await createUser("settings");
    userId = user.id;
    token = tokenFor(user);
  });
  after(async () => {
    await api.close();
    await disconnectDatabase();
  });

  it("returns my settings with safe defaults and no secrets", async () => {
    const res = await api.request("GET", "/settings", { token });
    assert.equal(res.status, 200);
    assert.equal(res.json.settings.notifications.inAppEnabled, true);
    assert.equal(res.json.settings.notifications.emailEnabled, false, "email is off until the user opts in");
    assert.equal(res.json.settings.notifications.emailDelivery.latest, null);
    assert.equal(res.json.settings.appearance.theme, "SYSTEM");
    assert.ok(!res.raw.includes("passwordHash"));
  });

  it("updates the name, notification choices and theme", async () => {
    const name = await api.request("PATCH", "/settings/account", { token, body: { name: "  New Name  " } });
    assert.equal(name.json.settings.account.name, "New Name");
    const notifications = await api.request("PATCH", "/settings/notifications", { token, body: { emailEnabled: true } });
    assert.equal(notifications.json.settings.notifications.emailEnabled, true);
    assert.equal(notifications.json.settings.notifications.inAppEnabled, true, "untouched field is kept");
    const theme = await api.request("PATCH", "/settings/appearance", { token, body: { theme: "DARK" } });
    assert.equal(theme.json.settings.appearance.theme, "DARK");

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    assert.deepEqual([stored.name, stored.emailNotificationsEnabled, stored.themePreference], ["New Name", true, "DARK"]);
  });

  it("rejects bad input with 400 and changes nothing", async () => {
    for (const [path, body] of [
      ["account", { name: "x".repeat(101) }],
      ["notifications", {}],
      ["appearance", { theme: "BLUE" }],
    ] as const) {
      assert.equal((await api.request("PATCH", `/settings/${path}`, { token, body })).status, 400, path);
    }
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).name, "New Name");
  });

  it("shows the latest email status, without provider details or the recipient", async () => {
    const website = await createWebsite(userId);
    const alert = await prisma.alert.create({ data: { websiteId: website.id, type: "SEO_ISSUE_OPENED", source: "SEO", severity: "ERROR", code: "X" } });
    await prisma.emailDelivery.create({
      data: { alertId: alert.id, userId, status: "FAILED", provider: "resend", lastErrorCode: "CONFIGURATION_ERROR", failedAt: new Date() },
    });
    const res = await api.request("GET", "/settings", { token });
    const latest = res.json.settings.notifications.emailDelivery.latest;
    assert.equal(latest.status, "FAILED");
    assert.deepEqual(Object.keys(latest).sort(), ["claimedAt", "createdAt", "failedAt", "sentAt", "status"]);
    for (const hidden of ["resend", "CONFIGURATION_ERROR", alert.id]) assert.ok(!res.raw.includes(hidden), hidden);
  });

  it("requires login", async () => {
    assert.equal((await api.request("GET", "/settings")).status, 401);
    assert.equal((await api.request("PATCH", "/settings/appearance", { body: { theme: "DARK" } })).status, 401);
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
