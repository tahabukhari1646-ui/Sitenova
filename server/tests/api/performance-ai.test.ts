// Stage 19.1: Performance AI routes -- the response contract (Stage 16.3 /
// 18.9) and which stored analysis GET-latest returns (Stage 18.2).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import {
  createPerformanceCheck,
  createUser,
  createWebsite,
  disconnectDatabase,
  insertAnalysis,
  uniqueTag,
  VALID_PERFORMANCE_OUTPUT,
} from "../helpers/factories";
import { aiPaths, RESPONSE_KEYS, startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { aiCallCount, assertNoExternalRequests } from "../helpers/safety";

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));

describe("Performance AI", () => {
  let api: TestServer;
  let token: string;
  let websiteId: string;

  before(async () => {
    api = await startTestServer();
    const owner = await createUser("perf-owner");
    token = tokenFor(owner);
    websiteId = (await createWebsite(owner.id)).id;
  });
  after(async () => {
    await api.close();
    await disconnectDatabase();
  });

  const latest = (checkId: string) => api.request("GET", `${aiPaths.performance(websiteId, checkId)}/latest`, { token });

  describe("POST", () => {
    it("returns 201 with the exact 9-key response, in order", async () => {
      const check = await createPerformanceCheck(websiteId, false);
      const res = await api.request("POST", aiPaths.performance(websiteId, check.id), { token });
      assert.equal(res.status, 201);
      assert.equal(res.json.success, true);
      assert.deepEqual(Object.keys(res.json.analysis), RESPONSE_KEYS.performance);
      assert.equal(res.json.analysis.performanceCheckId, check.id);
      assert.equal(res.json.analysis.status, "SUCCEEDED");
      assert.equal(res.json.analysis.provider, "mock");
      assert.equal(res.json.analysis.trigger, "MANUAL");
      assert.equal(typeof res.json.analysis.output.summary, "string");
      assert.ok(!("source" in res.json.analysis), "internal source column is not exposed");

      const row = await prisma.aiAnalysis.findUnique({ where: { id: res.json.analysis.id } });
      assert.equal(row?.source, "PERFORMANCE");
      assert.equal(row?.seoCheckId, null);
      assert.equal(row?.incidentId, null);
    });

    it("reuses an identical result for free (200, same id, no AI call)", async () => {
      const check = await createPerformanceCheck(websiteId, false);
      const first = await api.request("POST", aiPaths.performance(websiteId, check.id), { token });
      const callsBefore = aiCallCount();
      const second = await api.request("POST", aiPaths.performance(websiteId, check.id), { token });
      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      assert.equal(second.json.analysis.id, first.json.analysis.id);
      assert.equal(aiCallCount(), callsBefore, "no provider call for a reused result");
      assert.deepEqual(second.json, first.json);
    });
  });

  describe("GET latest", () => {
    it("returns null when the check has no analyses", async () => {
      const check = await createPerformanceCheck(websiteId);
      const res = await latest(check.id);
      assert.equal(res.status, 200);
      assert.equal(res.json.success, true);
      assert.equal(res.json.analysis, null);
    });

    it("ignores FAILED, INVALID_RESPONSE and PENDING rows", async () => {
      const check = await createPerformanceCheck(websiteId);
      await insertAnalysis({ performanceCheckId: check.id }, { status: "FAILED", createdAt: at(1) });
      await insertAnalysis({ performanceCheckId: check.id }, { status: "INVALID_RESPONSE", createdAt: at(2) });
      await insertAnalysis({ performanceCheckId: check.id }, { status: "PENDING", createdAt: at(3), trigger: "AUTOMATIC" });
      assert.equal((await latest(check.id)).json.analysis, null);
    });

    it("returns an older success even when newer rows failed", async () => {
      const check = await createPerformanceCheck(websiteId);
      const success = await insertAnalysis(
        { performanceCheckId: check.id },
        { status: "SUCCEEDED", createdAt: at(1), output: VALID_PERFORMANCE_OUTPUT("older-success"), trigger: "AUTOMATIC" }
      );
      await insertAnalysis({ performanceCheckId: check.id }, { status: "FAILED", createdAt: at(5) });
      const res = await latest(check.id);
      assert.equal(res.json.analysis.id, success.id);
      assert.equal(res.json.analysis.output.summary, "older-success");
    });

    it("returns the newest success, breaking time ties by the higher id", async () => {
      const check = await createPerformanceCheck(websiteId);
      await insertAnalysis({ performanceCheckId: check.id }, { status: "SUCCEEDED", createdAt: at(1), output: VALID_PERFORMANCE_OUTPUT("old") });
      const newer = await insertAnalysis({ performanceCheckId: check.id }, { status: "SUCCEEDED", createdAt: at(9), output: VALID_PERFORMANCE_OUTPUT("new") });
      assert.equal((await latest(check.id)).json.analysis.id, newer.id);

      const tied = await createPerformanceCheck(websiteId);
      const tag = uniqueTag();
      await insertAnalysis({ performanceCheckId: tied.id }, { id: `${tag}-a`, status: "SUCCEEDED", createdAt: at(9), output: VALID_PERFORMANCE_OUTPUT() });
      await insertAnalysis({ performanceCheckId: tied.id }, { id: `${tag}-z`, status: "SUCCEEDED", createdAt: at(9), output: VALID_PERFORMANCE_OUTPUT() });
      assert.equal((await latest(tied.id)).json.analysis.id, `${tag}-z`);
    });

    it("skips stored output that no longer passes validation", async () => {
      const check = await createPerformanceCheck(websiteId);
      await insertAnalysis({ performanceCheckId: check.id }, { status: "SUCCEEDED", createdAt: at(1), output: { bogus: true } });
      assert.equal((await latest(check.id)).json.analysis, null, "only-invalid -> null");

      const valid = await insertAnalysis({ performanceCheckId: check.id }, { status: "SUCCEEDED", createdAt: at(0), output: VALID_PERFORMANCE_OUTPUT("older-valid") });
      await insertAnalysis({ performanceCheckId: check.id }, { status: "SUCCEEDED", createdAt: at(30), output: { summary: "", priority: "NOPE", findings: "x" } });
      assert.equal((await latest(check.id)).json.analysis.id, valid.id, "newest invalid skipped");
    });

    it("returns exactly what POST returned", async () => {
      const check = await createPerformanceCheck(websiteId, false);
      const posted = await api.request("POST", aiPaths.performance(websiteId, check.id), { token });
      const fetched = await latest(check.id);
      assert.deepEqual(Object.keys(fetched.json.analysis), RESPONSE_KEYS.performance);
      assert.deepEqual(fetched.json.analysis, posted.json.analysis);
    });

    it("is read-only: never creates rows or calls the AI", async () => {
      const check = await createPerformanceCheck(websiteId);
      const rows = await prisma.aiAnalysis.count();
      const calls = aiCallCount();
      for (let i = 0; i < 5; i++) await latest(check.id);
      assert.equal(await prisma.aiAnalysis.count(), rows);
      assert.equal(aiCallCount(), calls);
    });
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
