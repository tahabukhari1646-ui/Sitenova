// Stage 19.1: SEO AI routes (Stage 18.3) -- request/response, storage,
// GET-latest rules, and the "OpenAI not configured" failure path.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { seoRepository } from "../../src/modules/seo/repository";
import { buildSeoAiInput } from "../../src/modules/ai-analysis/seo-input-builder";
import { computeSeoAiInputFingerprint } from "../../src/modules/ai-analysis/seo-fingerprint";
import { validateDiagnosisAiOutput } from "../../src/modules/ai-analysis/diagnosis-validation";
import {
  createPerformanceCheck,
  createSeoCheck,
  createUser,
  createWebsite,
  disconnectDatabase,
  insertAnalysis,
  PAGE,
  postgresErrorCode,
  uniqueTag,
  VALID_PERFORMANCE_OUTPUT,
} from "../helpers/factories";
import { aiPaths, RESPONSE_KEYS, startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { assertNoExternalRequests, withEnv } from "../helpers/safety";

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));

describe("SEO AI", () => {
  let api: TestServer;
  let token: string;
  let websiteId: string;
  let ownerId: string;

  before(async () => {
    api = await startTestServer();
    const owner = await createUser("seo-owner");
    token = tokenFor(owner);
    ownerId = owner.id;
    websiteId = (await createWebsite(owner.id)).id;
  });
  after(async () => {
    await api.close();
    await disconnectDatabase();
  });

  const post = (checkId: string) => api.request("POST", aiPaths.seo(websiteId, checkId), { token });
  const latest = (checkId: string) => api.request("GET", `${aiPaths.seo(websiteId, checkId)}/latest`, { token });

  it("finds the immediate predecessor on the same page only", async () => {
    const first = await createSeoCheck(websiteId, at(0));
    const second = await createSeoCheck(websiteId, at(10), { title: null });
    await createSeoCheck(websiteId, at(5), { pageUrl: `${PAGE}other/` });
    const predecessor = await seoRepository.findImmediatePredecessor(websiteId, PAGE, second);
    assert.equal(predecessor?.id, first.id);
    assert.equal(await seoRepository.findImmediatePredecessor(websiteId, PAGE, first), null);
    assert.equal((await seoRepository.findById(second.id))?.id, second.id);
    assert.equal(await seoRepository.findById("does-not-exist"), null);
  });

  it("POST returns 201 with a valid diagnosis and stores it with the right fingerprint", async () => {
    // A fresh website, so this page has exactly these two checks.
    const site = (await createWebsite(ownerId)).id;
    const previous = await createSeoCheck(site, at(0));
    const current = await createSeoCheck(site, at(10), { title: null, imagesMissingAltCount: 2 });

    const res = await api.request("POST", aiPaths.seo(site, current.id), { token });
    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.json.analysis), RESPONSE_KEYS.seo);
    assert.equal(res.json.analysis.seoCheckId, current.id);
    assert.equal(res.json.analysis.status, "SUCCEEDED");
    assert.equal(validateDiagnosisAiOutput(res.json.analysis.output).valid, true);

    const row = await prisma.aiAnalysis.findUniqueOrThrow({ where: { id: res.json.analysis.id } });
    assert.equal(row.source, "SEO");
    assert.equal(row.trigger, "MANUAL");
    assert.equal(row.performanceCheckId, null);
    assert.equal(row.incidentId, null);
    assert.equal(row.inputFingerprint, computeSeoAiInputFingerprint(buildSeoAiInput(current, previous)));

    const fetched = await api.request("GET", `${aiPaths.seo(site, current.id)}/latest`, { token });
    assert.deepEqual(fetched.json.analysis, res.json.analysis, "GET returns exactly what POST returned");
  });

  it("GET latest is null with no analyses and skips FAILED and invalid rows", async () => {
    const check = await createSeoCheck(websiteId, new Date());
    assert.equal((await latest(check.id)).json.analysis, null);

    const posted = await post(check.id);
    await insertAnalysis({ seoCheckId: check.id }, { status: "FAILED", createdAt: new Date(Date.now() + 60_000) });
    // Valid for Performance, but an SEO diagnosis also needs `limitations`.
    await insertAnalysis({ seoCheckId: check.id }, { status: "SUCCEEDED", createdAt: new Date(Date.now() + 120_000), output: VALID_PERFORMANCE_OUTPUT() });
    assert.equal((await latest(check.id)).json.analysis.id, posted.json.analysis.id);
  });

  it("rejects a Performance check id on the SEO route, and keeps the routes separate", async () => {
    const perf = await createPerformanceCheck(websiteId);
    assert.equal((await post(perf.id)).status, 404);
    assert.equal((await latest(perf.id)).status, 404);
    const perfLatest = await api.request("GET", `${aiPaths.performance(websiteId, perf.id)}/latest`, { token });
    assert.equal(perfLatest.status, 200);
    assert.equal(perfLatest.json.analysis, null, "Performance GET never returns SEO rows");
  });

  it("OpenAI without a key fails safely: 502, a FAILED row, no key name leaked, no network", async () => {
    const check = await createSeoCheck(websiteId, new Date(), { title: null });
    const res = await withEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: undefined }, () => post(check.id));
    assert.equal(res.status, 502);
    assert.ok(!res.raw.includes("OPENAI_API_KEY"));
    const row = await prisma.aiAnalysis.findFirstOrThrow({ where: { seoCheckId: check.id } });
    assert.equal(row.status, "FAILED");
    assert.equal(row.provider, "openai");
    assert.equal(row.output, null);
    assertNoExternalRequests();
  });

  it("the database refuses a row pointing at two targets", async () => {
    const seo = await createSeoCheck(websiteId);
    const perf = await createPerformanceCheck(websiteId);
    await assert.rejects(
      prisma.$executeRawUnsafe(
        `INSERT INTO ai_analyses (id, source, "seoCheckId", "performanceCheckId", provider, model, "inputFingerprint", status, trigger)
         VALUES ($1, 'SEO', $2, $3, 'mock', 'm', 'fp', 'SUCCEEDED', 'MANUAL')`,
        `mixed-${uniqueTag()}`,
        seo.id,
        perf.id
      ),
      (error) => postgresErrorCode(error) === "23514"
    );
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
