// Stage 19.3: the real SEO scanner end to end -- fetch the page from a
// fake website on this computer, read the HTML, find robots.txt/sitemap,
// save the scan, compare it with the previous one and raise alerts.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { prisma } from "../../src/config/prisma";
import { createUser, createWebsite, disconnectDatabase } from "../helpers/factories";
import { startFakeWebsite, UNREACHABLE_URL, type FakeWebsite } from "../helpers/fake-website";
import { startTestServer, tokenFor, type TestServer } from "../helpers/http";
import { aiCallCount, assertNoExternalRequests, setTestDnsRecord } from "../helpers/safety";

// Explicit page URLs on 127.0.0.1 are (correctly) refused, so the fake
// site is reached through a test-only name that resolves to it.
const HOST = "shop.seo-test.invalid";
const GOOD_TITLE = "Handmade leather shoes for every season";
const GOOD_META = "Browse our collection of handmade leather shoes, boots and sandals, delivered to your door.";

describe("SEO checks", () => {
  let api: TestServer;
  let site: FakeWebsite;
  let base: string;
  let userId: string;
  let token: string;

  // A healthy page; options introduce specific problems.
  function html(options: { title?: string | null; h1s?: string[]; links?: boolean; head?: string } = {}) {
    const { title = GOOD_TITLE, h1s = ["Leather shoes"], links = true, head = "" } = options;
    return `<!doctype html><html><head>
      ${title === null ? "" : `<title>${title}</title>`}
      <meta name="description" content="${GOOD_META}">
      <link rel="canonical" href="${base}">
      ${head}
    </head><body>
      ${h1s.map((h) => `<h1>${h}</h1>`).join("\n")}
      <p>Our shoes are made by hand in small batches.</p>
      ${links ? `<a href="/about">About us</a> <a href="https://elsewhere.example/">Partner</a>` : ""}
      <img src="/shoe.jpg" alt="A brown shoe">
    </body></html>`;
  }
  const serve = (body: string, extra: { status?: number; headers?: Record<string, string> } = {}) =>
    site.setPage("/", { body, ...extra });
  const scan = (websiteId: string, body?: unknown) => api.request("POST", `/websites/${websiteId}/seo/check`, { token, body });
  const newSite = async (url = base) => (await createWebsite(userId, { url })).id;
  const alertsFor = (websiteId: string) =>
    prisma.alert.findMany({ where: { websiteId }, orderBy: { createdAt: "asc" }, select: { type: true, severity: true, code: true } });

  before(async () => {
    api = await startTestServer();
    site = await startFakeWebsite();
    setTestDnsRecord(HOST, ["127.0.0.1"]);
    base = `http://${HOST}:${site.port}/`;
    const user = await prisma.user.update({
      where: { id: (await createUser("seo")).id },
      data: { emailNotificationsEnabled: true },
    });
    userId = user.id;
    token = tokenFor(user);
  });
  beforeEach(() => {
    site.clearPages();
    site.setPage("/robots.txt", { contentType: "text/plain", body: "User-agent: *\nAllow: /\n" });
    site.setPage("/sitemap.xml", { contentType: "application/xml", body: "<urlset></urlset>" });
  });
  after(async () => {
    await site.close();
    await api.close();
    await disconnectDatabase();
  });

  describe("one scan", () => {
    it("saves what the page contains, read from the final page after a redirect", async () => {
      const websiteId = await newSite();
      site.setPage("/", { status: 301, headers: { Location: "/home/" } });
      site.setPage("/home/", {
        body: html({ h1s: ["One", "Two"], head: `<script type="application/ld+json">{"@type":"Store"}</script>` }),
        headers: { "X-Robots-Tag": "noarchive" },
      });
      const res = await scan(websiteId);
      assert.equal(res.status, 201);
      const check = await prisma.seoCheck.findUniqueOrThrow({ where: { id: res.json.check.id } });
      assert.equal(check.requestedUrl, base);
      assert.equal(check.finalUrl, `${base}home/`);
      assert.equal(check.pageUrl, base, "history stays filed under the page that was asked for");
      assert.equal(check.statusCode, 200);
      assert.equal(check.title, GOOD_TITLE);
      assert.equal(check.metaDescription, GOOD_META);
      assert.deepEqual([check.h1Count, check.h1Text], [2, "One"]);
      assert.deepEqual([check.internalLinkCount, check.externalLinkCount], [1, 1]);
      assert.deepEqual([check.imageCount, check.imagesMissingAltCount], [1, 0]);
      assert.equal(check.xRobotsTag, "noarchive");
      assert.deepEqual(check.structuredData, { jsonLdCount: 1, types: ["Store"], invalidCount: 0 });
      assert.ok(check.wordCount > 5);
    });

    it("follows a Sitemap: line in robots.txt instead of guessing /sitemap.xml", async () => {
      const websiteId = await newSite();
      serve(html());
      site.setPage("/robots.txt", { contentType: "text/plain", body: `User-agent: *\nSitemap: ${base}maps/main.xml\n` });
      site.setPage("/maps/main.xml", { contentType: "application/xml", body: "<urlset></urlset>" });
      const before = site.requestedPaths().length;
      const check = (await scan(websiteId)).json.check;
      assert.deepEqual([check.robotsTxtFound, check.robotsTxtUrl], [true, `${base}robots.txt`]);
      assert.deepEqual([check.sitemapFound, check.sitemapUrl], [true, `${base}maps/main.xml`]);
      assert.deepEqual(site.requestedPaths().slice(before), ["/", "/robots.txt", "/maps/main.xml"], "at most 3 requests, no crawling");
    });

    it("a 404 means NOT FOUND, but a 500 means UNKNOWN -- never 'missing'", async () => {
      const websiteId = await newSite();
      serve(html());
      site.setPage("/robots.txt", { status: 404, body: "" });
      site.setPage("/sitemap.xml", { status: 404, body: "" });
      let check = (await scan(websiteId)).json.check;
      assert.deepEqual([check.robotsTxtFound, check.sitemapFound], [false, false]);

      site.setPage("/robots.txt", { status: 500, body: "" });
      site.setPage("/sitemap.xml", { status: 503, body: "" });
      check = (await scan(websiteId)).json.check;
      assert.deepEqual([check.robotsTxtFound, check.robotsTxtUrl, check.sitemapFound, check.sitemapUrl], [null, null, null, null]);
      const latest = await api.request("GET", `/websites/${websiteId}/seo/latest`, { token });
      const codes = latest.json.analysis.issues.map((i: { code: string }) => i.code);
      assert.ok(codes.includes("ROBOTS_TXT_UNKNOWN") && codes.includes("SITEMAP_UNKNOWN"));
      assert.ok(!codes.includes("SITEMAP_NOT_FOUND"));
    });

    it("a page answering 500 is still saved, and reported as a server error", async () => {
      const websiteId = await newSite();
      serve(html(), { status: 500 });
      assert.equal((await scan(websiteId)).status, 201);
      const latest = await api.request("GET", `/websites/${websiteId}/seo/latest`, { token });
      assert.equal(latest.json.check.statusCode, 500);
      assert.equal(latest.json.analysis.indexability, "NOT_INDEXABLE");
      assert.ok(latest.json.analysis.issues.some((i: { code: string }) => i.code === "STATUS_SERVER_ERROR"));
    });
  });

  describe("scans that cannot run save nothing", () => {
    it("a non-HTML page is refused with 400", async () => {
      const websiteId = await newSite();
      site.setPage("/", { contentType: "application/json", body: "{}" });
      const res = await scan(websiteId);
      assert.equal(res.status, 400);
      assert.equal(res.json.error, "This website's response could not be checked because its content type is not supported.");
      assert.equal(await prisma.seoCheck.count({ where: { websiteId } }), 0);
    });

    it("an unreachable website is a 502 with a plain message", async () => {
      const websiteId = await newSite(UNREACHABLE_URL);
      const res = await scan(websiteId);
      assert.equal(res.status, 502);
      assert.equal(res.json.error, "This website could not be reached due to a network error.");
      assert.ok(!res.raw.includes("127.0.0.1") && !res.raw.includes("ECONNREFUSED"), "no internal details leak");
      assert.equal(await prisma.seoCheck.count({ where: { websiteId } }), 0);
    });

    it("a page from another website, or a bad url value, is a 400", async () => {
      const websiteId = await newSite();
      const other = await scan(websiteId, { url: "https://somebody-else.example/" });
      assert.equal(other.status, 400);
      assert.equal(other.json.error, "The page URL must belong to this website.");
      assert.equal((await scan(websiteId, { url: 42 })).status, 400);
      assert.equal((await scan(websiteId, { url: "http://169.254.169.254/" })).status, 400);
      assert.equal(await prisma.seoCheck.count({ where: { websiteId } }), 0);
    });
  });

  describe("alerts", () => {
    it("first scan: none; a new problem: alert + notification + email; fixed: resolved alert", async () => {
      const websiteId = await newSite();
      const aiCalls = aiCallCount();

      serve(html());
      await scan(websiteId);
      assert.deepEqual(await alertsFor(websiteId), [], "the first scan is only a baseline");

      serve(html({ title: null }));
      await scan(websiteId);
      assert.deepEqual(await alertsFor(websiteId), [{ type: "SEO_ISSUE_OPENED", severity: "ERROR", code: "TITLE_MISSING" }]);
      assert.equal(await prisma.notification.count({ where: { alert: { websiteId } } }), 1);
      assert.equal(await prisma.emailDelivery.count({ where: { alert: { websiteId } } }), 1);

      serve(html());
      await scan(websiteId);
      assert.deepEqual((await alertsFor(websiteId)).map((a) => a.type), ["SEO_ISSUE_OPENED", "SEO_ISSUE_RESOLVED"]);

      assert.equal(aiCallCount(), aiCalls, "manual SEO scans never run the AI");
    });

    it("a first scan full of problems raises nothing", async () => {
      const websiteId = await newSite();
      serve(html({ title: null, h1s: [] }));
      await scan(websiteId);
      assert.deepEqual(await alertsFor(websiteId), []);
    });

    it("an INFO-level change (no internal links) raises no alert", async () => {
      const websiteId = await newSite();
      serve(html());
      await scan(websiteId);
      serve(html({ links: false }));
      await scan(websiteId);
      assert.deepEqual(await alertsFor(websiteId), []);
      const latest = await api.request("GET", `/websites/${websiteId}/seo/latest`, { token });
      assert.ok(latest.json.analysis.issues.some((i: { code: string }) => i.code === "NO_INTERNAL_LINKS"), "still shown, just not alerted");
    });
  });

  describe("history", () => {
    it("lists scans newest first, each with what changed since the one before", async () => {
      const websiteId = await newSite();
      for (const page of [html(), html({ h1s: ["A", "B"] }), html({ h1s: ["A", "B"] })]) {
        serve(page);
        await scan(websiteId);
      }
      const res = await api.request("GET", `/websites/${websiteId}/seo`, { token });
      assert.equal(res.status, 200);
      assert.deepEqual([res.json.returned, res.json.total, res.json.truncated], [3, 3, false]);
      const [newest, middle, oldest] = res.json.checks;
      assert.equal(oldest.changes.isBaseline, true);
      assert.deepEqual(middle.changes.newIssues.map((i: { code: string }) => i.code), ["H1_MULTIPLE"]);
      assert.deepEqual([newest.changes.newIssues, newest.changes.resolvedIssues], [[], []]);
    });

    it("each page has its own history -- a subpage never mixes with the homepage", async () => {
      const websiteId = await newSite();
      serve(html());
      await scan(websiteId);
      site.setPage("/about", { body: html({ h1s: [] }) });
      const sub = await scan(websiteId, { url: `${base}about` });
      assert.equal(sub.status, 201);
      assert.equal(sub.json.check.pageUrl, `${base}about`);

      const subHistory = await api.request("GET", `/websites/${websiteId}/seo?url=${encodeURIComponent(`${base}about`)}`, { token });
      assert.equal(subHistory.json.total, 1);
      assert.equal(subHistory.json.checks[0].changes.isBaseline, true, "not compared with the homepage");
      assert.equal((await api.request("GET", `/websites/${websiteId}/seo`, { token })).json.total, 1);
      assert.deepEqual(await alertsFor(websiteId), [], "the missing H1 on a first subpage scan is a baseline");
    });

    it("latest is a normal 200 with nothing in it before the first scan", async () => {
      const websiteId = await newSite();
      const res = await api.request("GET", `/websites/${websiteId}/seo/latest`, { token });
      assert.equal(res.status, 200);
      assert.deepEqual([res.json.check, res.json.analysis, res.json.pageUrl], [null, null, base]);
    });
  });

  it("someone else's website is 404 for scans, latest and history -- and is never fetched", async () => {
    const theirs = (await createWebsite((await createUser("seo-other")).id, { url: base })).id;
    const before = site.requestCount();
    assert.equal((await scan(theirs)).status, 404);
    assert.equal((await api.request("GET", `/websites/${theirs}/seo/latest`, { token })).status, 404);
    assert.equal((await api.request("GET", `/websites/${theirs}/seo`, { token })).status, 404);
    assert.equal(site.requestCount(), before);
  });

  it("made no outside network requests", () => {
    assertNoExternalRequests();
  });
});
