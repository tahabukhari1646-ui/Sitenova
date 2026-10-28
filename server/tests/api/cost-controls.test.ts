// Stage 19.1: AI cost controls (Stage 18.7) -- free reuse, the per-item
// cooldown, the per-user daily limit, and ?force=true.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import {
  createPerformanceCheck,
  createResolvedIncident,
  createSeoCheck,
  createUser,
  createWebsite,
  disconnectDatabase,
} from "../helpers/factories";
import { aiPaths, startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { aiCallCount, assertNoExternalRequests, NO_COOLDOWN, withEnv } from "../helpers/safety";

const COOLDOWN_MESSAGE = "Please wait a few seconds before running another AI analysis for this item.";
const LIMIT_MESSAGE = "Daily AI analysis limit reached. Try again later.";

async function newOwner(label: string) {
  const user = await createUser(label);
  const website = await createWebsite(user.id);
  return { user, token: tokenFor(user), websiteId: website.id };
}

describe("AI cost controls", () => {
  let api: TestServer;

  before(async () => {
    api = await startTestServer();
  });
  after(async () => {
    await api.close();
    await disconnectDatabase();
  });

  const post = (path: string, token: string, force = false) =>
    api.request("POST", `${path}${force ? "?force=true" : ""}`, { token });

  it("reuses identical results in all three areas: one AI call, one row", async () => {
    const { token, websiteId } = await newOwner("reuse");
    const targets = {
      performance: aiPaths.performance(websiteId, (await createPerformanceCheck(websiteId, false)).id),
      seo: aiPaths.seo(websiteId, (await createSeoCheck(websiteId, new Date(), { title: null })).id),
      uptime: aiPaths.uptime(websiteId, (await createResolvedIncident(websiteId)).id),
    };
    for (const [area, path] of Object.entries(targets)) {
      const calls = aiCallCount();
      const rows = await prisma.aiAnalysis.count();
      const first = await post(path, token);
      const second = await post(path, token);
      assert.equal(first.status, 201, area);
      assert.equal(second.status, 200, `${area}: reused`);
      assert.equal(second.json.analysis.id, first.json.analysis.id, area);
      assert.equal(aiCallCount() - calls, 1, `${area}: one AI call`);
      assert.equal((await prisma.aiAnalysis.count()) - rows, 1, `${area}: one row`);
    }
  });

  it("never reuses a result from a different provider", async () => {
    const { token, websiteId } = await newOwner("provider-switch");
    const path = aiPaths.performance(websiteId, (await createPerformanceCheck(websiteId, false)).id);
    assert.equal((await post(path, token)).status, 201);
    const switched = await withEnv({ ...NO_COOLDOWN, AI_PROVIDER: "openai", OPENAI_API_KEY: undefined }, () => post(path, token));
    assert.equal(switched.status, 502, "the mock result was not handed back as an OpenAI result");
  });

  it("cooldown: blocks a second paid run on the same item, even with force", async () => {
    const { token, websiteId } = await newOwner("cooldown");
    const path = aiPaths.performance(websiteId, (await createPerformanceCheck(websiteId, false)).id);
    assert.equal((await post(path, token)).status, 201);

    const forced = await post(path, token, true);
    assert.equal(forced.status, 429);
    assert.equal(forced.json.error, COOLDOWN_MESSAGE);

    const otherItem = aiPaths.performance(websiteId, (await createPerformanceCheck(websiteId, false)).id);
    assert.equal((await post(otherItem, token)).status, 201, "the cooldown is per item");

    const warn = console.warn;
    console.warn = () => {};
    try {
      const invalid = await withEnv({ AI_MANUAL_COOLDOWN_SECONDS: "abc" }, () => post(path, token, true));
      assert.equal(invalid.status, 429, "an invalid setting falls back to 30s instead of disabling it");
    } finally {
      console.warn = warn;
    }
  });

  it("force skips reuse and makes a fresh AI call once the cooldown allows it", async () => {
    const { token, websiteId } = await newOwner("force");
    const path = aiPaths.performance(websiteId, (await createPerformanceCheck(websiteId, false)).id);
    const first = await post(path, token);
    const calls = aiCallCount();
    const forced = await withEnv(NO_COOLDOWN, () => post(path, token, true));
    assert.equal(forced.status, 201);
    assert.notEqual(forced.json.analysis.id, first.json.analysis.id);
    assert.equal(aiCallCount() - calls, 1);
  });

  it("daily limit: counts paid runs across all areas, per user", async () => {
    const { token, websiteId } = await newOwner("limit");
    const performance = aiPaths.performance(websiteId, (await createPerformanceCheck(websiteId, false)).id);
    const seo = aiPaths.seo(websiteId, (await createSeoCheck(websiteId, new Date(), { title: null })).id);
    const uptime = aiPaths.uptime(websiteId, (await createResolvedIncident(websiteId)).id);
    const other = await newOwner("limit-other");
    const otherPath = aiPaths.performance(other.websiteId, (await createPerformanceCheck(other.websiteId)).id);

    await withEnv({ ...NO_COOLDOWN, AI_MANUAL_DAILY_LIMIT: "3" }, async () => {
      for (const path of [performance, seo, uptime]) assert.equal((await post(path, token, true)).status, 201);
      const over = await post(performance, token, true);
      assert.equal(over.status, 429);
      assert.equal(over.json.error, LIMIT_MESSAGE);
      assert.equal((await post(seo, token)).status, 200, "free reuse still works at the limit");
      assert.equal((await post(otherPath, other.token)).status, 201, "other users are unaffected");
    });
  });

  it("a daily limit of 0 means no paid runs at all", async () => {
    const { token, websiteId } = await newOwner("limit-zero");
    const path = aiPaths.performance(websiteId, (await createPerformanceCheck(websiteId)).id);
    const res = await withEnv({ AI_MANUAL_DAILY_LIMIT: "0" }, () => post(path, token));
    assert.equal(res.status, 429);
    assert.equal(res.json.error, LIMIT_MESSAGE);
  });

  it("limit messages never reveal the configured numbers or setting names", () => {
    for (const message of [COOLDOWN_MESSAGE, LIMIT_MESSAGE]) {
      assert.ok(!/AI_|\d/.test(message), message);
    }
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
