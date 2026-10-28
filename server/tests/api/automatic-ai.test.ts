// Stage 19.1: automatic AI (Stages 16.2 / 18.7 / 18.8 / 18.9) -- when it
// runs, that it runs at most once per check, the on/off switch, the SEO
// worker hook, and the "Ran automatically" trigger label.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { aiAnalysisService } from "../../src/modules/ai-analysis/service";
import { maybeRunAutomaticAiAnalysis } from "../../src/modules/performance/service";
import { seoRepository } from "../../src/modules/seo/repository";
import { seoService } from "../../src/modules/seo/service";
import { runSeoCycle } from "../../src/modules/seo/worker";
import {
  createPerformanceCheck,
  createSeoCheck,
  createUser,
  createWebsite,
  disconnectDatabase,
  HOUR,
} from "../helpers/factories";
import { aiPaths, startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { aiCallCount, assertNoExternalRequests, simulateSeoAiCrash, withEnv } from "../helpers/safety";

const NEW_ERROR = { title: null }; // TITLE_MISSING (an ERROR)
const NEW_WARNING = { h1Count: 0, h1Text: null }; // H1_MISSING (a WARNING)
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);
const ON = { AI_AUTOMATIC_ENABLED: "true" };

describe("automatic AI", () => {
  let api: TestServer;
  let userId: string;
  let token: string;

  before(async () => {
    api = await startTestServer();
    const user = await createUser("automatic");
    userId = user.id;
    token = tokenFor(user);
  });
  after(async () => {
    await api.close();
    await disconnectDatabase();
  });

  const newSite = async (isActive = false) => (await createWebsite(userId, { isActive })).id;
  const automaticRows = (where: { seoCheckId?: string; performanceCheckId?: string }) =>
    prisma.aiAnalysis.findMany({ where: { ...where, trigger: "AUTOMATIC" } });

  // An SEO check whose previous check was healthy and which now has `issue`.
  async function seoCheckWithNew(issue: Record<string, unknown>) {
    const site = await newSite();
    await createSeoCheck(site, hoursAgo(48));
    return { site, check: await createSeoCheck(site, hoursAgo(1), issue) };
  }

  describe("SEO trigger rule", () => {
    it("runs when a NEW error-level issue appears", async () => {
      const { check } = await seoCheckWithNew(NEW_ERROR);
      const calls = aiCallCount();
      assert.equal(await aiAnalysisService.analyzeSeoCheckAutomatically(check), "SUCCEEDED");
      const rows = await automaticRows({ seoCheckId: check.id });
      assert.equal(aiCallCount() - calls, 1);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].source, "SEO");
      assert.equal(rows[0].status, "SUCCEEDED");
      assert.notEqual(rows[0].output, null);
    });

    it("does not run for warnings only, unchanged errors, or a first check", async () => {
      const warning = (await seoCheckWithNew(NEW_WARNING)).check;
      const unchangedSite = await newSite();
      await createSeoCheck(unchangedSite, hoursAgo(48), NEW_ERROR);
      const unchanged = await createSeoCheck(unchangedSite, hoursAgo(1), NEW_ERROR);
      const first = await createSeoCheck(await newSite(), hoursAgo(1), NEW_ERROR);

      const calls = aiCallCount();
      for (const check of [warning, unchanged, first]) {
        assert.equal(await aiAnalysisService.analyzeSeoCheckAutomatically(check), "NOT_TRIGGERED");
        assert.equal((await automaticRows({ seoCheckId: check.id })).length, 0);
      }
      assert.equal(aiCallCount(), calls);
    });
  });

  describe("at most once per check", () => {
    it("a second attempt is ALREADY_CLAIMED and makes no AI call", async () => {
      const { check } = await seoCheckWithNew(NEW_ERROR);
      await aiAnalysisService.analyzeSeoCheckAutomatically(check);
      const calls = aiCallCount();
      assert.equal(await aiAnalysisService.analyzeSeoCheckAutomatically(check), "ALREADY_CLAIMED");
      assert.equal(aiCallCount(), calls);
      assert.equal((await automaticRows({ seoCheckId: check.id })).length, 1);
    });

    it("5 simultaneous attempts produce exactly one AI call and one row", async () => {
      const { check } = await seoCheckWithNew(NEW_ERROR);
      const calls = aiCallCount();
      const outcomes = await Promise.all(Array.from({ length: 5 }, () => aiAnalysisService.analyzeSeoCheckAutomatically(check)));
      assert.equal(outcomes.filter((o) => o === "SUCCEEDED").length, 1, outcomes.join(","));
      assert.equal(outcomes.filter((o) => o === "ALREADY_CLAIMED").length, 4, outcomes.join(","));
      assert.equal(aiCallCount() - calls, 1);
      assert.equal((await automaticRows({ seoCheckId: check.id })).length, 1);
    });

    it("a failed automatic run is recorded and never retried", async () => {
      const { check } = await seoCheckWithNew(NEW_ERROR);
      const failed = await withEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: undefined }, () =>
        aiAnalysisService.analyzeSeoCheckAutomatically(check)
      );
      assert.equal(failed, "FAILED");
      assert.equal(await aiAnalysisService.analyzeSeoCheckAutomatically(check), "ALREADY_CLAIMED");
      const rows = await automaticRows({ seoCheckId: check.id });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "FAILED");
      assert.equal(rows[0].output, null);
    });
  });

  describe("on/off switch", () => {
    it("SEO: disabled by AI_AUTOMATIC_ENABLED=false and by default in production", async () => {
      const { check } = await seoCheckWithNew(NEW_ERROR);
      const off = await withEnv({ AI_AUTOMATIC_ENABLED: "false" }, () => aiAnalysisService.analyzeSeoCheckAutomatically(check));
      const production = await withEnv({ AI_AUTOMATIC_ENABLED: undefined, NODE_ENV: "production" }, () =>
        aiAnalysisService.analyzeSeoCheckAutomatically(check)
      );
      assert.equal(off, "DISABLED");
      assert.equal(production, "DISABLED");
      assert.equal((await automaticRows({ seoCheckId: check.id })).length, 0);
    });

    it("Performance: follows the same switch", async () => {
      const site = await newSite();
      const cases: Array<[Record<string, string | undefined>, number]> = [
        [{ AI_AUTOMATIC_ENABLED: "false" }, 0],
        [{ AI_AUTOMATIC_ENABLED: "true" }, 1],
        [{ AI_AUTOMATIC_ENABLED: undefined, NODE_ENV: "production" }, 0],
        [{ AI_AUTOMATIC_ENABLED: undefined, NODE_ENV: "development" }, 1],
        [{ AI_AUTOMATIC_ENABLED: "true", NODE_ENV: "production" }, 1],
      ];
      for (const [env, expectedRows] of cases) {
        const previous = await createPerformanceCheck(site, true);
        const current = await createPerformanceCheck(site, false);
        await withEnv(env, () => maybeRunAutomaticAiAnalysis(previous, current));
        assert.equal((await automaticRows({ performanceCheckId: current.id })).length, expectedRows, JSON.stringify(env));
      }
    });
  });

  describe("SEO worker", () => {
    // Only the page fetch is replaced; everything after it is real code.
    async function runCycleFor(websiteId: string, produce: (websiteId: string) => Promise<{ id: string }>) {
      const originalFind = seoRepository.findActiveWebsites;
      const originalRun = seoService.runAutomaticSeoCheck;
      const logs: string[] = [];
      const errors: string[] = [];
      const { log, error } = console;
      const website = await prisma.website.findUniqueOrThrow({ where: { id: websiteId } });
      let produced: { id: string } | null = null;
      try {
        (seoRepository as any).findActiveWebsites = async () => [{ id: website.id, url: website.url, userId }];
        (seoService as any).runAutomaticSeoCheck = async () => (produced = await produce(website.id));
        console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
        console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
        await withEnv(ON, () => runSeoCycle());
      } finally {
        console.log = log;
        console.error = error;
        (seoRepository as any).findActiveWebsites = originalFind;
        (seoService as any).runAutomaticSeoCheck = originalRun;
      }
      return { produced: produced as { id: string } | null, logs, errors };
    }

    it("runs the automatic diagnosis right after a scheduled check", async () => {
      const site = await newSite(true);
      await createSeoCheck(site, hoursAgo(48));
      const calls = aiCallCount();
      const { produced, logs } = await runCycleFor(site, (id) => createSeoCheck(id, new Date(), NEW_ERROR));
      assert.ok(produced);
      const rows = await automaticRows({ seoCheckId: produced.id });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "SUCCEEDED");
      assert.equal(aiCallCount() - calls, 1);
      assert.ok(logs.some((line) => /1 due, 1 succeeded, 0 failed/.test(line)), logs.join("\n"));
    });

    it("an AI crash never fails the SEO check or stops the cycle", async () => {
      const site = await newSite(true);
      await createSeoCheck(site, hoursAgo(48));
      simulateSeoAiCrash(true);
      try {
        const { logs, errors } = await runCycleFor(site, (id) => createSeoCheck(id, new Date(), NEW_ERROR));
        assert.equal(await prisma.seoCheck.count({ where: { websiteId: site } }), 2, "the check was still saved");
        assert.ok(logs.some((line) => /1 due, 1 succeeded, 0 failed/.test(line)), logs.join("\n"));
        assert.ok(errors.some((line) => line.includes("Automatic SEO AI analysis errored") && line.includes(site)));
      } finally {
        simulateSeoAiCrash(false);
      }
    });
  });

  describe("trigger label and manual reuse", () => {
    it("automatic results show trigger AUTOMATIC and a manual click reuses them for free", async () => {
      const { site, check } = await seoCheckWithNew(NEW_ERROR);
      await withEnv(ON, () => aiAnalysisService.analyzeSeoCheckAutomatically(check));
      const automaticId = (await automaticRows({ seoCheckId: check.id }))[0].id;

      const latest = await api.request("GET", `${aiPaths.seo(site, check.id)}/latest`, { token });
      assert.equal(latest.json.analysis.id, automaticId);
      assert.equal(latest.json.analysis.trigger, "AUTOMATIC");

      const calls = aiCallCount();
      const manual = await api.request("POST", aiPaths.seo(site, check.id), { token });
      assert.equal(manual.status, 200);
      assert.equal(manual.json.analysis.id, automaticId);
      assert.equal(manual.json.analysis.trigger, "AUTOMATIC", "a reused automatic result is labelled honestly");
      assert.equal(aiCallCount(), calls);
    });

    it("works the same way for Performance", async () => {
      const site = await newSite();
      const previous = await createPerformanceCheck(site, true);
      const current = await createPerformanceCheck(site, false);
      await withEnv(ON, () => maybeRunAutomaticAiAnalysis(previous, current));

      const latest = await api.request("GET", `${aiPaths.performance(site, current.id)}/latest`, { token });
      assert.equal(latest.json.analysis.trigger, "AUTOMATIC");
      const calls = aiCallCount();
      const manual = await api.request("POST", aiPaths.performance(site, current.id), { token });
      assert.equal(manual.status, 200);
      assert.equal(aiCallCount(), calls);
    });
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
