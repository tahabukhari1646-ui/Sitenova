// Stage 19.2: uptime monitoring end to end, against a fake website on this
// computer -- checks, incidents, alerts, notifications and email intents.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { monitorService } from "../../src/modules/monitor/service";
import { runMonitoringCycle } from "../../src/modules/monitor/worker";
import { createUser, createWebsite, disconnectDatabase, HOUR } from "../helpers/factories";
import { startFakeWebsite, UNREACHABLE_URL, type FakeWebsite } from "../helpers/fake-website";
import { startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { assertNoExternalRequests } from "../helpers/safety";

describe("uptime monitoring", () => {
  let api: TestServer;
  let site: FakeWebsite;
  let userId: string;
  let token: string;

  before(async () => {
    api = await startTestServer();
    site = await startFakeWebsite();
    // Email on, so each alert should also produce one email intent.
    const user = await prisma.user.update({
      where: { id: (await createUser("uptime")).id },
      data: { emailNotificationsEnabled: true },
    });
    userId = user.id;
    token = tokenFor(user);
  });
  after(async () => {
    await site.close();
    await api.close();
    await disconnectDatabase();
  });

  // One real check of `url` (fetch + the same save transaction the
  // scheduler uses).
  async function check(websiteId: string, url: string) {
    return monitorService.saveCheckResult(await monitorService.checkWebsite(websiteId, url));
  }
  const snapshot = async (websiteId: string) => ({
    website: await prisma.website.findUniqueOrThrow({ where: { id: websiteId } }),
    incidents: await prisma.incident.findMany({ where: { websiteId }, orderBy: { startedAt: "asc" } }),
    alerts: await prisma.alert.findMany({ where: { websiteId }, orderBy: { createdAt: "asc" } }),
    notifications: await prisma.notification.count({ where: { alert: { websiteId } } }),
    emails: await prisma.emailDelivery.count({ where: { alert: { websiteId } } }),
  });

  it("a healthy site is checked for real and reported UP", async () => {
    const websiteId = (await createWebsite(userId, { url: site.url })).id;
    const before = site.requestCount();
    const saved = await check(websiteId, site.url);
    assert.equal(site.requestCount() - before, 1, "the fake site was actually contacted");
    assert.equal(saved.success, true);
    assert.equal(saved.statusCode, 200);

    const latest = await api.request("GET", `/websites/${websiteId}/latest`, { token });
    assert.equal(latest.status, 200);
    assert.equal(latest.json.status, "UP");
    assert.equal(latest.json.check.id, saved.id);
  });

  it("full outage cycle: 1 failure -> nothing, 2 -> incident + alert + notification + email, recovery -> resolved", async () => {
    const websiteId = (await createWebsite(userId, { url: UNREACHABLE_URL })).id;

    const first = await check(websiteId, UNREACHABLE_URL);
    let state = await snapshot(websiteId);
    assert.equal(first.success, false);
    assert.equal(first.statusCode, null);
    assert.equal(state.website.consecutiveFailures, 1);
    assert.equal(state.incidents.length, 0, "one failure is not yet an incident");
    assert.equal((await api.request("GET", `/websites/${websiteId}/latest`, { token })).json.status, "UNKNOWN");

    await check(websiteId, UNREACHABLE_URL);
    state = await snapshot(websiteId);
    assert.equal(state.incidents.length, 1);
    assert.equal(state.incidents[0].status, "OPEN");
    assert.equal(state.incidents[0].startedAt.getTime(), first.checkedAt.getTime(), "dated from the first failure");
    assert.deepEqual(state.alerts.map((a) => [a.type, a.severity, a.source]), [["INCIDENT_OPENED", "ERROR", "UPTIME"]]);
    assert.equal(state.notifications, 1);
    assert.equal(state.emails, 1);
    assert.equal((await api.request("GET", `/websites/${websiteId}/latest`, { token })).json.status, "DOWN");

    await check(websiteId, UNREACHABLE_URL);
    state = await snapshot(websiteId);
    assert.equal(state.incidents.length, 1, "a third failure does not open a second incident");
    assert.equal(state.alerts.length, 1);

    const recovered = await check(websiteId, site.url);
    state = await snapshot(websiteId);
    assert.equal(state.website.consecutiveFailures, 0);
    assert.equal(state.incidents[0].status, "RESOLVED");
    assert.equal(state.incidents[0].resolvedAt?.getTime(), recovered.checkedAt.getTime());
    assert.deepEqual(state.alerts.map((a) => [a.type, a.severity]), [["INCIDENT_OPENED", "ERROR"], ["INCIDENT_RESOLVED", "INFO"]]);
    assert.equal(state.notifications, 2);
    assert.equal(state.emails, 2);
  });

  // Stage 20.2: a 5xx answer means the server is failing -> counts as DOWN.
  it("a 500 server error is a failed check, and its status code is recorded", async () => {
    const websiteId = (await createWebsite(userId, { url: site.url })).id;
    site.respondWith(500);
    try {
      const saved = await check(websiteId, site.url);
      assert.equal(saved.success, false);
      assert.equal(saved.statusCode, 500);
      assert.equal((await snapshot(websiteId)).website.consecutiveFailures, 1);
    } finally {
      site.respondWith(200);
    }
  });

  it("server errors open an incident + alert, and a 200 resolves it", async () => {
    const websiteId = (await createWebsite(userId, { url: site.url })).id;
    try {
      site.respondWith(503);
      await check(websiteId, site.url);
      site.respondWith(502);
      await check(websiteId, site.url);
      let state = await snapshot(websiteId);
      assert.equal(state.incidents.length, 1);
      assert.equal(state.incidents[0].status, "OPEN");
      assert.deepEqual(state.alerts.map((a) => a.type), ["INCIDENT_OPENED"]);
      assert.equal(state.notifications, 1);
      assert.equal(state.emails, 1);
      const latest = await api.request("GET", `/websites/${websiteId}/latest`, { token });
      assert.equal(latest.json.status, "DOWN");
      assert.equal(latest.json.check.statusCode, 502);

      site.respondWith(200);
      await check(websiteId, site.url);
      state = await snapshot(websiteId);
      assert.equal(state.incidents[0].status, "RESOLVED");
      assert.deepEqual(state.alerts.map((a) => a.type), ["INCIDENT_OPENED", "INCIDENT_RESOLVED"]);
    } finally {
      site.respondWith(200);
    }
  });

  it("4xx answers (404, 401, 403, 429) still count as UP -- no incident", async () => {
    const websiteId = (await createWebsite(userId, { url: site.url })).id;
    try {
      for (const code of [404, 401, 403, 429]) {
        site.respondWith(code);
        const saved = await check(websiteId, site.url);
        assert.equal(saved.success, true, String(code));
        assert.equal(saved.statusCode, code);
      }
      const state = await snapshot(websiteId);
      assert.equal(state.website.consecutiveFailures, 0);
      assert.equal(state.incidents.length, 0);
      assert.equal(state.alerts.length, 0);
    } finally {
      site.respondWith(200);
    }
  });

  it("a failed save rolls back completely -- no half-written check, incident or alert", async () => {
    const websiteId = (await createWebsite(userId, { url: UNREACHABLE_URL })).id;
    await check(websiteId, UNREACHABLE_URL);
    // The second failure would save a check, bump the counter, open an
    // incident and then create an alert -- make that LAST write fail.
    const original = prisma.$transaction.bind(prisma);
    (prisma as any).$transaction = (fn: (tx: any) => Promise<unknown>) =>
      original(async (tx: any) => {
        tx.alert.create = async () => {
          throw new Error("simulated alert insert failure");
        };
        return fn(tx);
      });
    const checksBefore = await prisma.monitoringCheck.count({ where: { websiteId } });
    try {
      await assert.rejects(check(websiteId, UNREACHABLE_URL));
    } finally {
      (prisma as any).$transaction = original;
    }
    const state = await snapshot(websiteId);
    assert.equal(await prisma.monitoringCheck.count({ where: { websiteId } }), checksBefore, "no check saved");
    assert.equal(state.website.consecutiveFailures, 1, "counter not incremented");
    assert.equal(state.incidents.length, 0);
    assert.equal(state.alerts.length, 0);
  });

  it("one broken website never stops the cycle for the others", async () => {
    const broken = await createWebsite(userId, { url: site.url, isActive: true });
    const healthy = await createWebsite(userId, { url: site.url, isActive: true });
    const originalActive = monitorService.getActiveWebsites;
    const originalSave = monitorService.saveCheckResult;
    const errors: string[] = [];
    const consoleError = console.error;
    try {
      // Only these two sites, so the cycle never touches other tests' data.
      (monitorService as any).getActiveWebsites = async () => [broken, healthy];
      (monitorService as any).saveCheckResult = async (result: { websiteId: string }) => {
        if (result.websiteId === broken.id) throw new Error("simulated database failure");
        return originalSave(result as never);
      };
      console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
      await runMonitoringCycle();
    } finally {
      console.error = consoleError;
      (monitorService as any).getActiveWebsites = originalActive;
      (monitorService as any).saveCheckResult = originalSave;
    }
    assert.equal(await prisma.monitoringCheck.count({ where: { websiteId: healthy.id } }), 1);
    assert.equal(await prisma.monitoringCheck.count({ where: { websiteId: broken.id } }), 0);
    assert.ok(errors.some((line) => line.includes(broken.id) && line.includes("simulated database failure")));
  });

  describe("read routes", () => {
    let websiteId: string;

    before(async () => {
      websiteId = (await createWebsite(userId, { url: site.url })).id;
      const now = Date.now();
      await prisma.monitoringCheck.createMany({
        data: [
          { websiteId, success: true, statusCode: 200, responseTimeMs: 100, checkedAt: new Date(now - 1 * HOUR) },
          { websiteId, success: false, statusCode: null, responseTimeMs: 300, checkedAt: new Date(now - 2 * HOUR) },
          { websiteId, success: true, statusCode: 200, responseTimeMs: 200, checkedAt: new Date(now - 3 * 24 * HOUR) },
        ],
      });
      const open = await prisma.incident.create({ data: { websiteId, status: "OPEN", startedAt: new Date(now - HOUR) } });
      const resolved = await prisma.incident.create({
        data: { websiteId, status: "RESOLVED", startedAt: new Date(now - 5 * HOUR), resolvedAt: new Date(now - 4 * HOUR) },
      });
      await prisma.alert.createMany({
        data: [
          { websiteId, incidentId: open.id, type: "INCIDENT_OPENED", source: "UPTIME", severity: "ERROR" },
          { websiteId, incidentId: resolved.id, type: "INCIDENT_RESOLVED", source: "UPTIME", severity: "INFO" },
          { websiteId, type: "SEO_ISSUE_OPENED", source: "SEO", severity: "WARNING", code: "H1_MISSING" },
        ],
      });
    });

    it("history returns checks and stats for the chosen range", async () => {
      const day = await api.request("GET", `/websites/${websiteId}/checks`, { token });
      assert.equal(day.status, 200);
      assert.equal(day.json.checks.length, 2, "default range is 24h");
      assert.equal(day.json.stats.total, 2);
      assert.equal(day.json.stats.successful, 1);
      assert.equal(day.json.stats.failed, 1);
      assert.equal(day.json.stats.uptimePercentage, 50);
      assert.equal(day.json.stats.averageResponseTimeMs, 200);

      const week = await api.request("GET", `/websites/${websiteId}/checks?range=7d`, { token });
      assert.equal(week.json.checks.length, 3);
      assert.equal((await api.request("GET", `/websites/${websiteId}/checks?range=1y`, { token })).status, 400);
    });

    it("incidents can be filtered by status", async () => {
      const all = await api.request("GET", `/websites/${websiteId}/incidents`, { token });
      const open = await api.request("GET", `/websites/${websiteId}/incidents?status=OPEN`, { token });
      assert.equal(all.json.incidents.length, 2);
      assert.deepEqual(open.json.incidents.map((i: { status: string }) => i.status), ["OPEN"]);
      assert.equal((await api.request("GET", `/websites/${websiteId}/incidents?status=CLOSED`, { token })).status, 400);
    });

    it("alerts can be filtered by source, severity and type", async () => {
      const all = await api.request("GET", `/websites/${websiteId}/alerts`, { token });
      assert.equal(all.json.total, 3);
      assert.equal(all.json.truncated, false);
      assert.equal((await api.request("GET", `/websites/${websiteId}/alerts?source=SEO`, { token })).json.total, 1);
      assert.equal((await api.request("GET", `/websites/${websiteId}/alerts?severity=ERROR`, { token })).json.total, 1);
      assert.equal((await api.request("GET", `/websites/${websiteId}/alerts?type=INCIDENT_RESOLVED`, { token })).json.total, 1);
      assert.equal((await api.request("GET", `/websites/${websiteId}/alerts?source=EMAIL`, { token })).status, 400);
    });

    it("a manual check runs a real check and returns 201", async () => {
      const res = await api.request("POST", `/websites/${websiteId}/check`, { token });
      assert.equal(res.status, 201);
      assert.equal(res.json.check.success, true);
      assert.equal(res.json.check.statusCode, 200);
    });

    it("every monitoring route is private to the owner", async () => {
      const stranger = tokenFor(await createUser("uptime-stranger"));
      for (const [method, path] of [
        ["GET", "checks"],
        ["GET", "latest"],
        ["POST", "check"],
        ["GET", "incidents"],
        ["GET", "alerts"],
      ]) {
        assert.equal((await api.request(method, `/websites/${websiteId}/${path}`)).status, 401, `${path} no token`);
        assert.equal((await api.request(method, `/websites/${websiteId}/${path}`, { token: stranger })).status, 404, `${path} stranger`);
      }
    });
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
