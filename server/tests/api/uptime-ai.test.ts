// Stage 19.1: uptime incident AI (Stage 18.5) -- the summary figures the AI
// receives, the fingerprint, the mock diagnosis, and the HTTP routes.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { loadIncidentAiInput } from "../../src/modules/ai-analysis/incident-input-builder";
import { computeIncidentAiInputFingerprint } from "../../src/modules/ai-analysis/incident-fingerprint";
import { validateDiagnosisAiOutput } from "../../src/modules/ai-analysis/diagnosis-validation";
import { MockAiProvider } from "../../src/integrations/ai/mock-provider";
import {
  createPerformanceCheck,
  createSeoCheck,
  createUser,
  createWebsite,
  DAY,
  disconnectDatabase,
  insertAnalysis,
  MINUTE,
  VALID_PERFORMANCE_OUTPUT,
} from "../helpers/factories";
import { aiPaths, RESPONSE_KEYS, startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { assertNoExternalRequests, withEnv } from "../helpers/safety";
import type { Incident } from "../../src/generated/prisma/client";

const SITE_URL = "https://secret-site-name.example.invalid/";

describe("Uptime incident AI", () => {
  let api: TestServer;
  let token: string;
  let websiteId: string;
  let longWebsiteId: string;
  let resolved: Incident;
  let open: Incident;
  let serverErrors: Incident;
  let startedAt: Date;
  let resolvedAt: Date;

  before(async () => {
    api = await startTestServer();
    const owner = await createUser("uptime-owner");
    token = tokenFor(owner);
    websiteId = (await createWebsite(owner.id, { url: SITE_URL, name: "SecretSiteNameA" })).id;
    longWebsiteId = (await createWebsite(owner.id, { url: SITE_URL, name: "SecretSiteNameB" })).id;

    // A 31-minute resolved incident 3 days ago with a known shape:
    // 20 fast failures, 10 timeouts, 1 failure with a negative (unknown) time.
    startedAt = new Date(Date.now() - 3 * DAY);
    resolvedAt = new Date(startedAt.getTime() + 31 * MINUTE);
    const checks = [];
    // 24h before the incident: 60 healthy, 5 slow, 3 failed.
    for (let i = 0; i < 60; i++) checks.push({ websiteId, success: true, statusCode: 200, responseTimeMs: 300, checkedAt: new Date(startedAt.getTime() - (i + 1) * 10 * MINUTE) });
    for (let i = 0; i < 5; i++) checks.push({ websiteId, success: true, statusCode: 200, responseTimeMs: 4000, checkedAt: new Date(startedAt.getTime() - (11 * 60 + i) * MINUTE) });
    for (let i = 0; i < 3; i++) checks.push({ websiteId, success: false, statusCode: null, responseTimeMs: 50, checkedAt: new Date(startedAt.getTime() - (13 * 60 + i) * MINUTE) });
    for (let i = 0; i < 31; i++) {
      checks.push({ websiteId, success: false, statusCode: null, responseTimeMs: i < 20 ? 50 : i < 30 ? 10010 : -5, checkedAt: new Date(startedAt.getTime() + i * MINUTE) });
    }
    checks.push({ websiteId, success: true, statusCode: 200, responseTimeMs: 300, checkedAt: resolvedAt });
    await prisma.monitoringCheck.createMany({ data: checks });
    resolved = await prisma.incident.create({ data: { websiteId, status: "RESOLVED", startedAt, resolvedAt } });
    // Two earlier incidents inside 30 days, one outside.
    for (const daysBefore of [5, 10, 40]) {
      const start = new Date(startedAt.getTime() - daysBefore * DAY);
      await prisma.incident.create({ data: { websiteId, status: "RESOLVED", startedAt: start, resolvedAt: new Date(start.getTime() + 5 * MINUTE) } });
    }

    // A long OPEN incident: 2000 fast failures every 30 seconds.
    const openStart = new Date(Date.now() - 2000 * 30_000 - MINUTE);
    await prisma.monitoringCheck.createMany({
      data: Array.from({ length: 2000 }, (_, i) => ({ websiteId: longWebsiteId, success: false, statusCode: null, responseTimeMs: 100, checkedAt: new Date(openStart.getTime() + i * 30_000) })),
    });
    open = await prisma.incident.create({ data: { websiteId: longWebsiteId, status: "OPEN", startedAt: openStart } });

    // Stage 20.2: a 4-minute incident of 3 server errors + 1 timeout.
    const errorSiteId = (await createWebsite(owner.id, { url: SITE_URL })).id;
    const errorStart = new Date(Date.now() - 2 * DAY);
    await prisma.monitoringCheck.createMany({
      data: [503, 500, 502, null].map((statusCode, i) => ({
        websiteId: errorSiteId,
        success: false,
        statusCode,
        responseTimeMs: statusCode === null ? 10010 : 200,
        checkedAt: new Date(errorStart.getTime() + i * MINUTE),
      })),
    });
    serverErrors = await prisma.incident.create({
      data: { websiteId: errorSiteId, status: "RESOLVED", startedAt: errorStart, resolvedAt: new Date(errorStart.getTime() + 4 * MINUTE) },
    });
  });
  after(async () => {
    await api.close();
    await disconnectDatabase();
  });

  describe("loadIncidentAiInput", () => {
    it("summarises the incident window", async () => {
      const input = await loadIncidentAiInput(resolved);
      assert.equal(input.incident.status, "RESOLVED");
      assert.equal(input.incident.durationMs, 31 * MINUTE);
      assert.equal(input.incident.resolvedAt, resolvedAt.toISOString());
      assert.equal(input.window.totalChecks, 31);
      assert.equal(input.window.failedChecks, 31);
      assert.equal(input.window.timeoutFailures, 10);
      assert.equal(input.window.fastFailures, 20);
      assert.equal(input.window.serverErrorFailures, 0);
      assert.deepEqual(input.window.failedResponseTimeMs, { min: 50, median: 50, max: 10010 });
    });

    it("sends 20 sample checks oldest-first, flags timeouts, and treats negative times as unknown", async () => {
      const { sampleChecks } = await loadIncidentAiInput(resolved);
      assert.equal(sampleChecks.length, 20);
      assert.equal(sampleChecks.filter((c) => c.hitTimeoutCeiling).length, 9);
      assert.ok(sampleChecks.some((c) => c.responseTimeMs === null));
      assert.ok(sampleChecks.every((c, i, all) => i === 0 || all[i - 1].checkedAt <= c.checkedAt));
    });

    it("includes the 24h baseline, recovery and 30-day history", async () => {
      const input = await loadIncidentAiInput(resolved);
      assert.equal(input.baseline24h.checks, 68);
      assert.equal(input.baseline24h.successRate, 95.59);
      assert.equal(input.baseline24h.medianResponseTimeMs, 300);
      assert.equal(input.baseline24h.slowChecks, 5);
      assert.equal(input.baseline24h.lastSuccessBefore?.checkedAt, new Date(startedAt.getTime() - 10 * MINUTE).toISOString());
      assert.equal(input.recovery.firstSuccess?.checkedAt, resolvedAt.toISOString());
      assert.equal(input.recovery.firstSuccess?.statusCode, 200);
      assert.equal(input.history.otherIncidentsLast30Days, 2, "the 40-day-old incident is excluded");
    });

    it("states the monitoring facts honestly", async () => {
      const { monitoring } = await loadIncidentAiInput(resolved);
      assert.equal(monitoring.requestTimeoutMs, 10000);
      assert.equal(monitoring.timeoutCeilingMs, 9500);
      assert.equal(monitoring.failureReasonRecorded, false);
      assert.equal(monitoring.serverErrorsCountAsDown, true);
      assert.equal(monitoring.vantagePoints, 1);
    });

    it("never includes the site URL, name or id", async () => {
      const json = JSON.stringify(await loadIncidentAiInput(resolved));
      for (const secret of ["secret-site-name", "SecretSiteName", websiteId]) assert.ok(!json.includes(secret), secret);
    });

    it("counts server errors separately from failures with no answer", async () => {
      const input = await loadIncidentAiInput(serverErrors);
      assert.equal(input.window.failedChecks, 4);
      assert.equal(input.window.serverErrorFailures, 3);
      assert.equal(input.window.timeoutFailures, 1);
      assert.equal(input.window.fastFailures, 0, "a quick 5xx is not a 'fast failure'");
      assert.deepEqual(input.sampleChecks.map((c) => [c.statusCode, c.hitTimeoutCeiling]), [[503, false], [500, false], [502, false], [null, true]]);
    });

    it("handles a long open incident with a bounded sample", async () => {
      const input = await loadIncidentAiInput(open);
      assert.equal(input.incident.durationMs, null);
      assert.notEqual(input.incident.observedUntil, null);
      assert.equal(input.recovery.firstSuccess, null);
      assert.equal(input.window.totalChecks, 2000);
      assert.equal(input.window.fastFailures, 2000);
      assert.equal(input.sampleChecks.length, 20);
    });

    it("fingerprints stably, ignoring sample order, and changes with the facts", async () => {
      const input = await loadIncidentAiInput(resolved);
      const fingerprint = computeIncidentAiInputFingerprint(input);
      assert.equal(computeIncidentAiInputFingerprint({ ...input, sampleChecks: [...input.sampleChecks].reverse() }), fingerprint);
      assert.notEqual(computeIncidentAiInputFingerprint({ ...input, window: { ...input.window, failedChecks: 30 } }), fingerprint);
    });
  });

  describe("mock incident diagnosis", () => {
    it("is valid, deterministic and cautious", async () => {
      const mock = new MockAiProvider();
      const input = await loadIncidentAiInput(resolved);
      const output = await mock.analyzeIncident(input);
      assert.equal(validateDiagnosisAiOutput(output).valid, true);
      assert.deepEqual(await mock.analyzeIncident(input), output);
      assert.equal(output.priority, "HIGH");
      assert.equal(output.limitations.length, 4);
      assert.ok(output.findings.some((f) => f.title === "Recurring incidents"));
      assert.ok(output.findings.every((f) => f.confidence === "LOW"));
      assert.match(output.findings[0].explanation, /not recorded/);
    });

    it("treats an ongoing outage as critical", async () => {
      const output = await new MockAiProvider().analyzeIncident(await loadIncidentAiInput(open));
      assert.equal(output.priority, "CRITICAL");
      assert.match(output.findings[0].title, /currently unreachable/);
    });

    it("describes mostly-5xx incidents as server errors, not unreachable", async () => {
      const output = await new MockAiProvider().analyzeIncident(await loadIncidentAiInput(serverErrors));
      assert.equal(validateDiagnosisAiOutput(output).valid, true);
      assert.equal(output.findings[0].title, "Website returned server errors");
      assert.ok(output.findings[0].evidence.includes("3 failure(s) were HTTP 5xx server error responses."));
    });
  });

  describe("routes", () => {
    const post = (site: string, incidentId: string) => api.request("POST", aiPaths.uptime(site, incidentId), { token });
    const latest = (site: string, incidentId: string) => api.request("GET", `${aiPaths.uptime(site, incidentId)}/latest`, { token });

    it("POST returns 201 with the 9-key response and stores an UPTIME row", async () => {
      assert.equal((await latest(longWebsiteId, open.id)).json.analysis, null);
      const res = await post(websiteId, resolved.id);
      assert.equal(res.status, 201);
      assert.deepEqual(Object.keys(res.json.analysis), RESPONSE_KEYS.uptime);
      assert.equal(res.json.analysis.incidentId, resolved.id);
      assert.equal(validateDiagnosisAiOutput(res.json.analysis.output).valid, true);

      const row = await prisma.aiAnalysis.findUniqueOrThrow({ where: { id: res.json.analysis.id } });
      assert.equal(row.source, "UPTIME");
      assert.equal(row.seoCheckId, null);
      assert.equal(row.performanceCheckId, null);
      assert.equal(row.inputFingerprint, computeIncidentAiInputFingerprint(await loadIncidentAiInput(resolved)));

      assert.deepEqual((await latest(websiteId, resolved.id)).json.analysis, res.json.analysis);
      assert.equal((await post(longWebsiteId, open.id)).json.analysis.output.priority, "CRITICAL");
    });

    it("GET latest skips FAILED and invalid rows", async () => {
      const posted = await latest(websiteId, resolved.id);
      await insertAnalysis({ incidentId: resolved.id }, { status: "FAILED", createdAt: new Date(Date.now() + 60_000) });
      await insertAnalysis({ incidentId: resolved.id }, { status: "SUCCEEDED", createdAt: new Date(Date.now() + 120_000), output: VALID_PERFORMANCE_OUTPUT() });
      assert.equal((await latest(websiteId, resolved.id)).json.analysis.id, posted.json.analysis.id);
    });

    it("rejects SEO and Performance ids, and the other routes never return UPTIME rows", async () => {
      const seo = await createSeoCheck(websiteId);
      const perf = await createPerformanceCheck(websiteId);
      assert.equal((await post(websiteId, seo.id)).status, 404);
      assert.equal((await post(websiteId, perf.id)).status, 404);
      assert.equal((await api.request("GET", `${aiPaths.seo(websiteId, seo.id)}/latest`, { token })).json.analysis, null);
      assert.equal((await api.request("GET", `${aiPaths.performance(websiteId, perf.id)}/latest`, { token })).json.analysis, null);
    });

    it("OpenAI without a key fails safely with 502 and a FAILED row", async () => {
      const res = await withEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: undefined, AI_MANUAL_COOLDOWN_SECONDS: "0" }, () =>
        post(websiteId, resolved.id)
      );
      assert.equal(res.status, 502);
      const row = await prisma.aiAnalysis.findFirstOrThrow({ where: { incidentId: resolved.id, provider: "openai" } });
      assert.equal(row.status, "FAILED");
      assert.equal(row.output, null);
      assert.equal(row.source, "UPTIME");
    });
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
