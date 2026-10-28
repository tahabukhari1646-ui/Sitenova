// Stage 19.2: website management -- create, list, view, edit, pause and
// delete, always limited to the owner's own websites.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { createResolvedIncident, createSeoCheck, createPerformanceCheck, createUser, disconnectDatabase } from "../helpers/factories";
import { startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { assertNoExternalRequests } from "../helpers/safety";

describe("websites", () => {
  let api: TestServer;
  let token: string;
  let strangerToken: string;

  before(async () => {
    api = await startTestServer();
    token = tokenFor(await createUser("sites"));
    strangerToken = tokenFor(await createUser("sites-stranger"));
  });
  after(async () => {
    await api.close();
    await disconnectDatabase();
  });

  const create = (body: unknown, as = token) => api.request("POST", "/websites", { token: as, body });

  it("creates a website owned by me, active by default", async () => {
    const res = await create({ url: "https://mine.example.invalid", name: "Mine", platform: "Shopify" });
    assert.equal(res.status, 201);
    assert.equal(res.json.website.name, "Mine");
    assert.equal(res.json.website.isActive, true);
    assert.equal(res.json.website.consecutiveFailures, 0);
    assert.equal((await create({ name: "no url" })).status, 400);
  });

  it("lists and shows only my websites", async () => {
    const mine = (await create({ url: "https://list.example.invalid" })).json.website.id;
    const theirs = (await create({ url: "https://theirs.example.invalid" }, strangerToken)).json.website.id;

    const list = await api.request("GET", "/websites", { token });
    const ids = list.json.websites.map((w: { id: string }) => w.id);
    assert.ok(ids.includes(mine));
    assert.ok(!ids.includes(theirs));
    assert.equal((await api.request("GET", `/websites/${mine}`, { token })).status, 200);
    assert.equal((await api.request("GET", `/websites/${theirs}`, { token })).status, 404);
  });

  it("edits and pauses my website", async () => {
    const id = (await create({ url: "https://edit.example.invalid" })).json.website.id;
    const res = await api.request("PATCH", `/websites/${id}`, { token, body: { name: "Renamed", isActive: false } });
    assert.equal(res.status, 200);
    assert.equal(res.json.website.name, "Renamed");
    assert.equal(res.json.website.isActive, false);
    assert.equal((await api.request("PATCH", `/websites/${id}`, { token, body: {} })).status, 400);
  });

  it("deletes my website together with all its data", async () => {
    const id = (await create({ url: "https://delete.example.invalid" })).json.website.id;
    await createResolvedIncident(id);
    await createSeoCheck(id);
    await createPerformanceCheck(id);
    const incident = await prisma.incident.findFirstOrThrow({ where: { websiteId: id } });
    await prisma.alert.create({ data: { websiteId: id, incidentId: incident.id, type: "INCIDENT_OPENED", source: "UPTIME", severity: "ERROR" } });

    const res = await api.request("DELETE", `/websites/${id}`, { token });
    assert.equal(res.status, 200);
    assert.equal(await prisma.website.count({ where: { id } }), 0);
    for (const [table, count] of [
      ["monitoringCheck", await prisma.monitoringCheck.count({ where: { websiteId: id } })],
      ["incident", await prisma.incident.count({ where: { websiteId: id } })],
      ["alert", await prisma.alert.count({ where: { websiteId: id } })],
      ["seoCheck", await prisma.seoCheck.count({ where: { websiteId: id } })],
      ["performanceCheck", await prisma.performanceCheck.count({ where: { websiteId: id } })],
    ] as const) {
      assert.equal(count, 0, `${table} rows removed`);
    }
    assert.equal((await api.request("DELETE", `/websites/${id}`, { token })).status, 404);
  });

  it("can never edit or delete someone else's website", async () => {
    const theirs = (await create({ url: "https://protected.example.invalid", name: "Theirs" }, strangerToken)).json.website.id;
    assert.equal((await api.request("PATCH", `/websites/${theirs}`, { token, body: { name: "Hacked" } })).status, 404);
    assert.equal((await api.request("DELETE", `/websites/${theirs}`, { token })).status, 404);
    const stored = await prisma.website.findUniqueOrThrow({ where: { id: theirs } });
    assert.equal(stored.name, "Theirs");
  });

  it("requires login", async () => {
    assert.equal((await api.request("POST", "/websites", { body: { url: "https://x.example.invalid" } })).status, 401);
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
