// Stage 20.1: SSRF protection end to end -- internal addresses can't be
// added as websites, and the uptime checker never contacts them, even via
// a redirect or a domain that resolves to a private address.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { monitorService } from "../../src/modules/monitor/service";
import { UNSAFE_WEBSITE_URL_MESSAGE } from "../../src/utils/websiteUrl";
import { createUser, createWebsite, disconnectDatabase } from "../helpers/factories";
import { startFakeWebsite, type FakeWebsite } from "../helpers/fake-website";
import { startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { assertNoExternalRequests, setTestDnsRecord, withEnv } from "../helpers/safety";

// Without the test-only loopback exception -- exactly how a real server runs.
const PRODUCTION_RULES = { SAFE_FETCH_ALLOW_LOOPBACK_FOR_TESTS: undefined };

const UNSAFE_URLS = [
  "not a url",
  "ftp://files.example.invalid/",
  "file:///etc/passwd",
  "javascript:alert(1)",
  "https://user:secret@shop.example.invalid/",
  "http://localhost:5432/",
  "http://LOCALHOST./",
  "http://admin.localhost/",
  "http://127.0.0.1/",
  "http://10.0.0.5/",
  "http://192.168.1.1/",
  "http://172.16.0.1:8080/",
  "http://169.254.169.254/latest/meta-data/",
  "http://0.0.0.0/",
  "http://[::1]/",
  "http://[fe80::1]/",
  "http://[::ffff:127.0.0.1]/",
  "http://2130706433/", // 127.0.0.1 written as a number
  "http://0x7f.0.0.1/", // 127.0.0.1 written in hex
  "http://internal.example.invalid/", // resolves to a private address (fake DNS below)
];

// Runs a check and returns the refusal codes it logged (empty = not refused,
// e.g. an ordinary timeout -- which must NOT count as protection).
async function refusalCodes(run: () => Promise<{ success: boolean }>) {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const result = await run();
    assert.equal(result.success, false);
  } finally {
    console.warn = warn;
  }
  return warnings.map((w) => w.split(": ").pop());
}

describe("SSRF protection", () => {
  let api: TestServer;
  let site: FakeWebsite;
  let userId: string;
  let token: string;

  before(async () => {
    api = await startTestServer();
    site = await startFakeWebsite();
    const user = await createUser("ssrf");
    userId = user.id;
    token = tokenFor(user);
    setTestDnsRecord("internal.example.invalid", ["10.1.2.3"]);
    setTestDnsRecord("mixed.example.invalid", ["93.184.216.34", "192.168.0.10"]);
    setTestDnsRecord("public.example.invalid", ["93.184.216.34"]);
  });
  after(async () => {
    await site.close();
    await api.close();
    await disconnectDatabase();
  });

  describe("adding and editing websites", () => {
    it("rejects every unsafe address with a clear 400, saving nothing", async () => {
      const before = await prisma.website.count({ where: { userId } });
      for (const url of UNSAFE_URLS) {
        const res = await withEnv(PRODUCTION_RULES, () => api.request("POST", "/websites", { token, body: { url } }));
        assert.equal(res.status, 400, url);
        assert.equal(res.json.error, UNSAFE_WEBSITE_URL_MESSAGE, url);
      }
      assert.equal(await prisma.website.count({ where: { userId } }), before);
    });

    it("rejects a name where ANY resolved address is private", async () => {
      const res = await api.request("POST", "/websites", { token, body: { url: "https://mixed.example.invalid/" } });
      assert.equal(res.status, 400);
    });

    it("still accepts public websites, and names that don't resolve yet", async () => {
      for (const url of ["https://public.example.invalid/", "http://public.example.invalid:8080/path?q=1", "https://not-registered-yet.example.invalid/"]) {
        assert.equal((await api.request("POST", "/websites", { token, body: { url } })).status, 201, url);
      }
    });

    it("rejects changing a website's URL to an unsafe one, keeping the old URL", async () => {
      const id = (await api.request("POST", "/websites", { token, body: { url: "https://public.example.invalid/" } })).json.website.id;
      const res = await api.request("PATCH", `/websites/${id}`, { token, body: { url: "http://169.254.169.254/" } });
      assert.equal(res.status, 400);
      assert.equal((await prisma.website.findUniqueOrThrow({ where: { id } })).url, "https://public.example.invalid/");
      assert.equal((await api.request("PATCH", `/websites/${id}`, { token, body: { name: "Renamed only" } })).status, 200);
    });

    it("someone else's website is 404 even with an unsafe URL (no hint it exists)", async () => {
      const theirs = await createWebsite((await createUser("ssrf-other")).id);
      const res = await api.request("PATCH", `/websites/${theirs.id}`, { token, body: { url: "http://10.0.0.1/" } });
      assert.equal(res.status, 404);
    });
  });

  describe("uptime checks", () => {
    it("never connects to an internal address -- recorded as a failed check", async () => {
      const contacted = site.requestCount();
      const warnings: string[] = [];
      const warn = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
      try {
        const result = await withEnv(PRODUCTION_RULES, () => monitorService.checkWebsite("website-1", site.url));
        assert.equal(result.success, false);
        assert.equal(result.statusCode, null);
      } finally {
        console.warn = warn;
      }
      assert.equal(site.requestCount(), contacted, "the internal site was never contacted");
      assert.ok(warnings.some((w) => w.includes("website-1") && w.includes("BLOCKED_DESTINATION")), warnings.join("\n"));
      assert.ok(!warnings.join(" ").includes(site.url), "the URL itself is never logged");
    });

    it("refuses a domain whose DNS points at a private address", async () => {
      const codes = await refusalCodes(() => monitorService.checkWebsite("website-2", "http://internal.example.invalid/"));
      assert.deepEqual(codes, ["BLOCKED_DESTINATION"]);
    });

    it("refuses a redirect from an allowed site to the cloud metadata address", async () => {
      site.redirectTo("http://169.254.169.254/latest/meta-data/");
      try {
        const contacted = site.requestCount();
        const started = Date.now();
        const codes = await refusalCodes(() => monitorService.checkWebsite("website-3", site.url));
        assert.equal(site.requestCount() - contacted, 1, "the first hop was made");
        assert.deepEqual(codes, ["BLOCKED_DESTINATION"], "refused, not merely timed out");
        assert.ok(Date.now() - started < 2000, "refused immediately, before any connection attempt");
      } finally {
        site.redirectTo(null);
      }
    });

    it("refuses stored URLs that are not http(s) or contain credentials", async () => {
      const expected = { "file:///etc/passwd": "UNSUPPORTED_PROTOCOL", "ftp://files.example.invalid/": "UNSUPPORTED_PROTOCOL", "http://user:pass@public.example.invalid/": "CREDENTIALS_NOT_ALLOWED" };
      for (const [url, code] of Object.entries(expected)) {
        assert.deepEqual(await refusalCodes(() => monitorService.checkWebsite("website-4", url)), [code], url);
      }
    });

    it("an old unsafe website already in the database is checked safely", async () => {
      const legacy = await createWebsite(userId, { url: "http://localhost:1/" });
      const saved = await withEnv(PRODUCTION_RULES, async () =>
        monitorService.saveCheckResult(await monitorService.checkWebsite(legacy.id, legacy.url))
      );
      assert.equal(saved.success, false);
    });

    it("normal checks still work and report the real status code", async () => {
      const result = await monitorService.checkWebsite("website-5", site.url);
      assert.equal(result.success, true);
      assert.equal(result.statusCode, 200);
    });
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
