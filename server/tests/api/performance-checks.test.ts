// Stage 19.3: performance checks end to end with a fake Google PageSpeed
// -- reading Google's result, refusing unusable results, alerts, the
// automatic AI trigger and the read routes. Google is never contacted.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { performanceService } from "../../src/modules/performance/service";
import { createUser, createWebsite, disconnectDatabase } from "../helpers/factories";
import {
  FAKE_PAGESPEED_KEY,
  GOOD_FIELD,
  installFakePageSpeed,
  POOR_FIELD,
  psiBody,
  type FakePageSpeed,
} from "../helpers/fake-pagespeed";
import { startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { aiCallCount, assertNoExternalRequests, withEnv } from "../helpers/safety";

const SITE = "https://perf-shop.example.invalid/";

describe("performance checks", () => {
  let api: TestServer;
  let psi: FakePageSpeed;
  let user: { id: string; email: string };
  let token: string;

  const runCheck = (websiteId: string, body: unknown = { strategy: "MOBILE" }) =>
    api.request("POST", `/websites/${websiteId}/performance/check`, { token, body });
  const newSite = async () => (await createWebsite(user.id, { url: SITE })).id;
  const alertsFor = (websiteId: string) =>
    prisma.alert.findMany({ where: { websiteId }, orderBy: { createdAt: "asc" }, select: { type: true, severity: true, code: true } });

  before(async () => {
    api = await startTestServer();
    psi = installFakePageSpeed();
    process.env.PAGESPEED_API_KEY = FAKE_PAGESPEED_KEY;
    user = await prisma.user.update({
      where: { id: (await createUser("perf")).id },
      data: { emailNotificationsEnabled: true },
    });
    token = tokenFor(user);
  });
  after(async () => {
    delete process.env.PAGESPEED_API_KEY;
    psi.restore();
    await api.close();
    await disconnectDatabase();
  });

  describe("reading Google's result", () => {
    it("stores the numbers correctly and asks Google for the right page and strategy", async () => {
      const websiteId = await newSite();
      psi.answer({ body: psiBody({ score: 0.874, labLcpMs: 1234.6, labCls: 0.0123, labFcpMs: 900.4, labTbtMs: 49.5, field: { lcpMs: 2400.4, inpMs: 150, clsX100: 7, ttfbMs: 600 } }) });
      const calls = psi.calls.length;
      const res = await runCheck(websiteId);
      assert.equal(res.status, 201);
      const check = res.json.check;
      assert.equal(check.performanceScore, 87, "0.874 -> 87");
      assert.deepEqual([check.labLcpMs, check.labFcpMs, check.labTbtMs], [1235, 900, 50], "ms rounded");
      assert.equal(check.labCls, 0.0123, "CLS keeps its decimals");
      assert.deepEqual([check.fieldLcpMs, check.fieldInpMs, check.fieldTtfbMs], [2400, 150, 600]);
      assert.equal(check.fieldCls, 0.07, "Google sends field CLS x100");
      assert.deepEqual(psi.calls.slice(calls), [{ url: SITE, strategy: "mobile", key: FAKE_PAGESPEED_KEY }]);
    });

    it("a site with no real-user data is normal: field values are empty", async () => {
      psi.answer({ body: psiBody({ field: null }) });
      const res = await runCheck(await newSite(), { strategy: "DESKTOP" });
      assert.equal(res.status, 201);
      assert.equal(res.json.check.strategy, "DESKTOP");
      assert.deepEqual([res.json.check.fieldLcpMs, res.json.check.fieldInpMs, res.json.check.fieldCls, res.json.check.fieldTtfbMs], [null, null, null, null]);
      assert.equal(psi.calls.at(-1)?.strategy, "desktop");
    });
  });

  describe("unusable results save nothing and never leak the API key", () => {
    const failures: Array<[string, Parameters<FakePageSpeed["answer"]>[0], RegExp]> = [
      ["network failure", "network-error", /network error or timeout/],
      ["Google error", { status: 400, body: { error: { message: "Invalid value for url" } } }, /request failed: Invalid value for url/],
      ["Google error without a body", { status: 503, text: "Service Unavailable" }, /non-JSON response/],
      ["Lighthouse runtime error", { body: { lighthouseResult: { runtimeError: { code: "NO_FCP", message: "The page did not paint" } } } }, /runtime error: The page did not paint/],
      ["no lab metrics", { body: { lighthouseResult: { categories: {}, audits: {} } } }, /did not contain usable Lighthouse lab metrics/],
      ["no lighthouseResult", { body: {} }, /missing lighthouseResult/],
    ];

    for (const [label, answer, message] of failures) {
      it(`${label} -> 502`, async () => {
        const websiteId = await newSite();
        psi.answer(answer);
        const res = await runCheck(websiteId);
        assert.equal(res.status, 502);
        assert.match(res.json.error, message);
        assert.ok(!res.raw.includes(FAKE_PAGESPEED_KEY), "the API key is never in a response");
        assert.equal(await prisma.performanceCheck.count({ where: { websiteId } }), 0);
      });
    }

    it("no API key configured -> 502, and Google is not even asked", async () => {
      const websiteId = await newSite();
      const calls = psi.calls.length;
      const res = await withEnv({ PAGESPEED_API_KEY: undefined }, () => runCheck(websiteId));
      assert.equal(res.status, 502);
      assert.equal(res.json.error, "PAGESPEED_API_KEY is not configured.");
      assert.equal(psi.calls.length, calls);
      assert.equal(await prisma.performanceCheck.count({ where: { websiteId } }), 0);
    });

    it("a missing or wrong strategy is 400, before Google is asked", async () => {
      const websiteId = await newSite();
      const calls = psi.calls.length;
      for (const body of [{}, { strategy: "mobile" }, { strategy: "TABLET" }]) {
        assert.equal((await runCheck(websiteId, body)).status, 400, JSON.stringify(body));
      }
      assert.equal((await runCheck(websiteId, { strategy: "MOBILE", url: "https://other.example/" })).status, 400);
      assert.equal(psi.calls.length, calls);
    });
  });

  describe("alerts", () => {
    it("Good -> Poor raises an ERROR alert + notification + email; Poor -> Good recovers (INFO)", async () => {
      const websiteId = await newSite();
      const aiCalls = aiCallCount();
      for (const field of [GOOD_FIELD, POOR_FIELD, GOOD_FIELD]) {
        psi.answer({ body: psiBody({ field }) });
        assert.equal((await runCheck(websiteId)).status, 201);
      }
      assert.deepEqual(await alertsFor(websiteId), [
        { type: "PERFORMANCE_DEGRADED", severity: "ERROR", code: "MOBILE_CORE_WEB_VITALS" },
        { type: "PERFORMANCE_RECOVERED", severity: "INFO", code: "MOBILE_CORE_WEB_VITALS" },
      ]);
      assert.equal(await prisma.notification.count({ where: { alert: { websiteId } } }), 2);
      assert.equal(await prisma.emailDelivery.count({ where: { alert: { websiteId } } }), 2);
      assert.equal(aiCallCount(), aiCalls, "manual checks never run the automatic AI");
    });

    it("mobile and desktop are tracked separately; missing data never alerts", async () => {
      const websiteId = await newSite();
      psi.answer({ body: psiBody({ field: GOOD_FIELD }) });
      await runCheck(websiteId, { strategy: "MOBILE" });
      psi.answer({ body: psiBody({ field: POOR_FIELD }) });
      await runCheck(websiteId, { strategy: "DESKTOP" });
      assert.deepEqual(await alertsFor(websiteId), [], "a first desktop check is a baseline, not compared with mobile");

      psi.answer({ body: psiBody({ field: null }) });
      await runCheck(websiteId, { strategy: "MOBILE" });
      assert.deepEqual(await alertsFor(websiteId), [], "Good -> Unknown is not a degradation");
    });
  });

  describe("automatic checks", () => {
    it("run the AI only when performance gets worse", async () => {
      const websiteId = await newSite();
      const website = { id: websiteId, url: SITE, userId: user.id };
      await withEnv({ AI_AUTOMATIC_ENABLED: "true" }, async () => {
        const calls = aiCallCount();
        psi.answer({ body: psiBody({ field: GOOD_FIELD }) });
        await performanceService.runAutomaticCheck(website, "MOBILE");
        assert.equal(aiCallCount(), calls, "first check: nothing to compare");
        psi.answer({ body: psiBody({ field: POOR_FIELD }) });
        await performanceService.runAutomaticCheck(website, "MOBILE");
        assert.equal(aiCallCount(), calls + 1, "Good -> Poor: one diagnosis");
        await performanceService.runAutomaticCheck(website, "MOBILE");
        assert.equal(aiCallCount(), calls + 1, "still Poor: no second diagnosis");
      });
      assert.equal(await prisma.aiAnalysis.count({ where: { performanceCheck: { websiteId } } }), 1);
    });

    it("a failed Google request throws to the scheduler and saves nothing", async () => {
      const websiteId = await newSite();
      psi.answer("network-error");
      await assert.rejects(performanceService.runAutomaticCheck({ id: websiteId, url: SITE, userId: user.id }, "DESKTOP"), /PageSpeed/);
      assert.equal(await prisma.performanceCheck.count({ where: { websiteId } }), 0);
    });
  });

  describe("read routes", () => {
    it("latest, history (oldest first, with ratings) and stats", async () => {
      const websiteId = await newSite();
      for (const score of [0.95, 0.4]) {
        psi.answer({ body: psiBody({ score }) });
        await runCheck(websiteId);
      }
      const latest = await api.request("GET", `/websites/${websiteId}/performance/latest?strategy=MOBILE`, { token });
      assert.equal(latest.status, 200);
      assert.equal(latest.json.check.performanceScore, 40);
      assert.equal(latest.json.pageUrl, SITE);

      const history = await api.request("GET", `/websites/${websiteId}/performance?strategy=MOBILE&range=24h`, { token });
      assert.equal(history.status, 200);
      assert.deepEqual(history.json.checks.map((c: { performanceScore: number }) => c.performanceScore), [95, 40]);
      assert.deepEqual(history.json.checks.map((c: { ratings: { performanceScore: string } }) => c.ratings.performanceScore), ["GOOD", "POOR"]);

      const stats = await api.request("GET", `/websites/${websiteId}/performance/stats?strategy=MOBILE`, { token });
      assert.equal(stats.status, 200);
      assert.equal(stats.json.stats.latest.performanceScore, 40);

      assert.equal((await api.request("GET", `/websites/${websiteId}/performance?strategy=MOBILE&range=1y`, { token })).status, 400);
      assert.equal((await api.request("GET", `/websites/${websiteId}/performance`, { token })).status, 400);
    });

    it("latest is a normal 200 with no check before the first one", async () => {
      const res = await api.request("GET", `/websites/${await newSite()}/performance/latest`, { token });
      assert.equal(res.status, 200);
      assert.equal(res.json.check, null);
    });
  });

  it("someone else's website is 404 everywhere -- and Google is never asked", async () => {
    const theirs = (await createWebsite((await createUser("perf-other")).id, { url: SITE })).id;
    const calls = psi.calls.length;
    assert.equal((await runCheck(theirs)).status, 404);
    for (const path of ["performance/latest", "performance?strategy=MOBILE", "performance/stats?strategy=MOBILE"]) {
      assert.equal((await api.request("GET", `/websites/${theirs}/${path}`, { token })).status, 404, path);
    }
    assert.equal(psi.calls.length, calls);
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
