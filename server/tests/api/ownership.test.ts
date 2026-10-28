// Stage 19.1: security matrix for all 6 AI routes -- a user can only ever
// reach their own websites' data, and a refusal never leaks anything.
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
import { aiCallCount, assertNoExternalRequests } from "../helpers/safety";

type Area = keyof typeof aiPaths;
type Targets = Record<Area, string>;

async function targetsFor(websiteId: string): Promise<Targets> {
  return {
    performance: (await createPerformanceCheck(websiteId)).id,
    seo: (await createSeoCheck(websiteId, new Date(), { title: "Short" })).id,
    uptime: (await createResolvedIncident(websiteId, 3)).id,
  };
}

describe("AI route ownership", () => {
  let api: TestServer;
  let tokenA: string;
  let tokenB: string;
  let emailB: string;
  let siteA: string;
  let otherSiteA: string;
  let targetsA: Targets;
  let targetsB: Targets;

  before(async () => {
    api = await startTestServer();
    const userA = await createUser("owner-a");
    const userB = await createUser("owner-b");
    tokenA = tokenFor(userA);
    tokenB = tokenFor(userB);
    emailB = userB.email;
    siteA = (await createWebsite(userA.id)).id;
    otherSiteA = (await createWebsite(userA.id)).id;
    targetsA = await targetsFor(siteA);
    targetsB = await targetsFor((await createWebsite(userB.id)).id);
  });
  after(async () => {
    await api.close();
    await disconnectDatabase();
  });

  for (const area of Object.keys(aiPaths) as Area[]) {
    for (const [method, suffix] of [["POST", ""], ["GET", "/latest"]] as const) {
      it(`${method} ${area}: refuses every request that is not the owner's own`, async () => {
        const path = (websiteId: string, targetId: string) => aiPaths[area](websiteId, targetId) + suffix;
        const rows = await prisma.aiAnalysis.count();
        const calls = aiCallCount();

        const noToken = await api.request(method, path(siteA, targetsA[area]));
        const badToken = await api.request(method, path(siteA, targetsA[area]), { token: "not-a-real-token" });
        const otherUser = await api.request(method, path(siteA, targetsA[area]), { token: tokenB });
        const foreignTarget = await api.request(method, path(siteA, targetsB[area]), { token: tokenA });
        const wrongWebsite = await api.request(method, path(otherSiteA, targetsA[area]), { token: tokenA });
        const missing = await api.request(method, path(siteA, "does-not-exist"), { token: tokenA });

        assert.equal(noToken.status, 401, "no token");
        assert.equal(badToken.status, 401, "invalid token");
        assert.equal(otherUser.status, 404, "another user's website");
        assert.equal(foreignTarget.status, 404, "another user's item under my website");
        assert.equal(wrongWebsite.status, 404, "my item under my other website");
        assert.equal(missing.status, 404, "an item that does not exist");

        for (const res of [otherUser, foreignTarget]) {
          assert.ok(!res.raw.includes('"output"'), "no analysis data in a refusal");
          assert.ok(!res.raw.includes(emailB), "no account details in a refusal");
        }
        assert.equal(await prisma.aiAnalysis.count(), rows, "refused requests write nothing");
        assert.equal(aiCallCount(), calls, "refused requests never call the AI");
      });
    }
  }

  it("the owner can use all three AI routes", async () => {
    for (const area of Object.keys(aiPaths) as Area[]) {
      const res = await api.request("POST", aiPaths[area](siteA, targetsA[area]), { token: tokenA });
      assert.equal(res.status, 201, area);
    }
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
