// Stage 19.3: the pure SEO rules -- what the HTML parser reads, which
// issues a page has, what changed between two scans, and which changes
// raise an alert.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSeoHtml } from "../../src/modules/seo/parser";
import {
  analyzeSeoIssues,
  META_DESCRIPTION_MAX_LENGTH,
  META_DESCRIPTION_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from "../../src/modules/seo/issues";
import { deriveSeoChanges } from "../../src/modules/seo/changes";
import { deriveSeoAlerts } from "../../src/modules/seo/alerts";
import { isSeoCheckDue, SEO_CHECK_INTERVAL_MS } from "../../src/modules/seo/due";
import type { SeoPageObservation } from "../../src/modules/seo/types";
import { HEALTHY_SEO, PAGE } from "../helpers/fixtures";

// A page with no SEO issues at all; overrides create one problem at a time.
function page(overrides: Partial<SeoPageObservation> = {}): SeoPageObservation {
  const { robotsTxtFound, robotsTxtUrl, sitemapFound, sitemapUrl, ...rest } = HEALTHY_SEO;
  return {
    ...rest,
    requestedUrl: PAGE,
    finalUrl: PAGE,
    statusCode: 200,
    robotsTxt: { status: "FOUND", url: robotsTxtUrl },
    sitemap: { status: "FOUND", url: sitemapUrl },
    ...overrides,
  };
}
const codes = (observation: SeoPageObservation) => analyzeSeoIssues(observation).issues.map((i) => i.code);
const text = (length: number) => "x".repeat(length);

describe("SEO HTML parser", () => {
  const html = `<!doctype html><html><head>
    <title>  Shop   for   shoes  </title>
    <meta name="Description" content="Good shoes.">
    <meta name="robots" content="noindex, nofollow">
    <link rel="canonical" href="/shoes/">
    <script type="application/ld+json">{"@type":"Product","@graph":[{"@type":["Offer","Product"]}]}</script>
    <script type="application/ld+json">{ not json</script>
  </head><body>
    <h1>Shoes</h1><h1>Second</h1><h2>a</h2><h3>b</h3>
    <a href="/about">a</a><a href="https://site.example.invalid/contact">b</a><a href="https://other.example/">c</a>
    <a href="#top">skip</a><a href="mailto:x@y.z">skip</a><a href="javascript:void(0)">skip</a>
    <img src="a.png" alt="A"><img src="b.png" alt=""><img src="c.png">
    <script>var hidden = "not counted";</script>
    <p>four words of text</p>
  </body></html>`;
  const parsed = parseSeoHtml(html, PAGE);

  it("reads title, meta description, robots and canonical, with whitespace tidied", () => {
    assert.equal(parsed.title, "Shop for shoes");
    assert.equal(parsed.metaDescription, "Good shoes.");
    assert.equal(parsed.robotsMeta, "noindex, nofollow");
    assert.equal(parsed.canonicalUrl, "/shoes/");
  });

  it("counts headings, links (internal vs external, skipping #/mailto/javascript) and images", () => {
    assert.deepEqual([parsed.h1Count, parsed.h1Text, parsed.h2Count, parsed.h3Count], [2, "Shoes", 1, 1]);
    assert.deepEqual([parsed.internalLinkCount, parsed.externalLinkCount], [2, 1]);
    // alt="" is a deliberate decorative image, not a missing alt.
    assert.deepEqual([parsed.imageCount, parsed.imagesMissingAltCount], [3, 1]);
  });

  it("counts words without script text, and reads JSON-LD types including @graph", () => {
    const words = parseSeoHtml("<body><h1>Big shoes</h1>\n<p>four words of text</p><script>var x = 'not counted';</script><style>p { color: red }</style></body>", PAGE);
    assert.equal(words.wordCount, 6);
    // KNOWN QUIRK (reported, not fixed in 19.3): text in tags placed
    // directly next to each other is joined, so "<h1>A</h1><h1>B</h1>"
    // counts as one word. Update this if word counting is changed.
    assert.equal(parseSeoHtml("<body><h1>Shoes</h1><h1>Second</h1></body>", PAGE).wordCount, 1);
    assert.deepEqual(parsed.structuredData, { jsonLdCount: 2, types: ["Product", "Offer"], invalidCount: 1 });
  });

  it("treats an empty page as all-missing, never crashing", () => {
    const empty = parseSeoHtml("", PAGE);
    assert.deepEqual([empty.title, empty.metaDescription, empty.h1Count, empty.wordCount], [null, null, 0, 0]);
  });
});

describe("SEO issue rules", () => {
  it("a healthy page has no issues and is indexable", () => {
    assert.deepEqual(analyzeSeoIssues(page()), { issues: [], indexability: "INDEXABLE" });
  });

  it("title length: 30-60 characters is fine, outside is a warning, missing is an error", () => {
    assert.equal(TITLE_MIN_LENGTH, 30);
    assert.equal(TITLE_MAX_LENGTH, 60);
    assert.deepEqual(codes(page({ title: text(29) })), ["TITLE_TOO_SHORT"]);
    assert.deepEqual(codes(page({ title: text(30) })), []);
    assert.deepEqual(codes(page({ title: text(60) })), []);
    assert.deepEqual(codes(page({ title: text(61) })), ["TITLE_TOO_LONG"]);
    const missing = analyzeSeoIssues(page({ title: null })).issues;
    assert.deepEqual(missing.map((i) => [i.code, i.severity]), [["TITLE_MISSING", "ERROR"]]);
  });

  it("meta description length: 70-160 characters is fine", () => {
    assert.equal(META_DESCRIPTION_MIN_LENGTH, 70);
    assert.equal(META_DESCRIPTION_MAX_LENGTH, 160);
    assert.deepEqual(codes(page({ metaDescription: text(69) })), ["META_DESCRIPTION_TOO_SHORT"]);
    assert.deepEqual(codes(page({ metaDescription: text(70) })), []);
    assert.deepEqual(codes(page({ metaDescription: text(160) })), []);
    assert.deepEqual(codes(page({ metaDescription: text(161) })), ["META_DESCRIPTION_TOO_LONG"]);
    assert.deepEqual(codes(page({ metaDescription: null })), ["META_DESCRIPTION_MISSING"]);
  });

  it("headings, images, canonical and links", () => {
    assert.deepEqual(codes(page({ h1Count: 0, h1Text: null })), ["H1_MISSING"]);
    assert.deepEqual(codes(page({ h1Count: 2 })), ["H1_MULTIPLE"]);
    assert.deepEqual(codes(page({ imagesMissingAltCount: 1 })), ["IMAGES_MISSING_ALT"]);
    assert.deepEqual(codes(page({ canonicalUrl: null })), ["CANONICAL_MISSING"]);
    assert.deepEqual(codes(page({ canonicalUrl: "http://[bad" })), ["CANONICAL_MALFORMED"]);
    assert.deepEqual(codes(page({ canonicalUrl: "https://site.example.invalid/other/" })), ["CANONICAL_MISMATCH"]);
    assert.deepEqual(codes(page({ internalLinkCount: 0 })), ["NO_INTERNAL_LINKS"]);
  });

  it("noindex in the page OR the X-Robots-Tag header makes the page not indexable", () => {
    for (const overrides of [{ robotsMeta: "noindex" }, { xRobotsTag: "NOINDEX, nofollow" }]) {
      const result = analyzeSeoIssues(page(overrides));
      assert.ok(result.issues.some((i) => i.code === "NOINDEX_DIRECTIVE" && i.severity === "WARNING"));
      assert.equal(result.indexability, "NOT_INDEXABLE");
    }
    assert.deepEqual(codes(page({ robotsMeta: "nofollow" })), ["NOFOLLOW_DIRECTIVE"]);
  });

  it("HTTP status and http:// pages", () => {
    assert.deepEqual(codes(page({ statusCode: 404 })), ["STATUS_NOT_FOUND"]);
    assert.deepEqual(codes(page({ statusCode: 403 })), ["STATUS_CLIENT_ERROR"]);
    assert.deepEqual(codes(page({ statusCode: 503 })), ["STATUS_SERVER_ERROR"]);
    assert.equal(analyzeSeoIssues(page({ statusCode: 500 })).indexability, "NOT_INDEXABLE");
    assert.deepEqual(codes(page({ requestedUrl: "http://a.example/", finalUrl: "http://a.example/", canonicalUrl: "http://a.example/" })), ["FINAL_URL_NOT_SECURE"]);
    assert.deepEqual(codes(page({ finalUrl: "http://site.example.invalid/", canonicalUrl: "http://site.example.invalid/" })), ["HTTPS_DOWNGRADE_REDIRECT"]);
  });

  it("structured data", () => {
    assert.deepEqual(codes(page({ structuredData: { jsonLdCount: 1, types: [], invalidCount: 1 } })), ["STRUCTURED_DATA_INVALID"]);
    assert.deepEqual(codes(page({ structuredData: { jsonLdCount: 1, types: [], invalidCount: 0 } })), ["STRUCTURED_DATA_NO_TYPE"]);
  });

  it("robots.txt / sitemap: NOT FOUND and UNKNOWN are reported differently", () => {
    assert.deepEqual(codes(page({ sitemap: { status: "NOT_FOUND", url: null } })), ["SITEMAP_NOT_FOUND"]);
    assert.deepEqual(codes(page({ sitemap: { status: "UNKNOWN", url: null } })), ["SITEMAP_UNKNOWN"]);
    assert.deepEqual(codes(page({ robotsTxt: { status: "NOT_FOUND", url: null } })), ["ROBOTS_TXT_NOT_FOUND"]);
    assert.deepEqual(codes(page({ robotsTxt: { status: "UNKNOWN", url: null } })), ["ROBOTS_TXT_UNKNOWN"]);
  });

  it("sorts errors first, then warnings, then info", () => {
    const severities = analyzeSeoIssues(page({ title: null, h1Count: 0, internalLinkCount: 0 })).issues.map((i) => i.severity);
    assert.deepEqual(severities, ["ERROR", "WARNING", "INFO"]);
  });
});

describe("SEO changes between two scans", () => {
  it("the first scan is a baseline with nothing new or resolved", () => {
    assert.deepEqual(deriveSeoChanges(null, page({ title: null })), { isBaseline: true, changes: [], newIssues: [], resolvedIssues: [] });
  });

  it("reports new and resolved issues, but not ones present in both", () => {
    const set = deriveSeoChanges(page({ title: null, h1Count: 2 }), page({ h1Count: 2, imagesMissingAltCount: 3 }));
    assert.equal(set.isBaseline, false);
    assert.deepEqual(set.newIssues.map((i) => i.code), ["IMAGES_MISSING_ALT"]);
    assert.deepEqual(set.resolvedIssues.map((i) => i.code), ["TITLE_MISSING"]);
    assert.ok(set.changes.length > 0);
  });

  it("identical scans report no changes", () => {
    assert.deepEqual(deriveSeoChanges(page(), page()), { isBaseline: false, changes: [], newIssues: [], resolvedIssues: [] });
  });
});

describe("SEO alert rules", () => {
  const alerts = (previous: SeoPageObservation | null, current: SeoPageObservation) =>
    deriveSeoAlerts("website-1", "check-1", deriveSeoChanges(previous, current)).map((a) => [a.type, a.severity, a.code]);

  it("never alerts on the first scan, even for a page full of problems", () => {
    assert.deepEqual(alerts(null, page({ title: null, h1Count: 0, statusCode: 500 })), []);
  });

  it("alerts when a WARNING or ERROR issue opens, and again when it resolves (same severity)", () => {
    assert.deepEqual(alerts(page(), page({ title: null })), [["SEO_ISSUE_OPENED", "ERROR", "TITLE_MISSING"]]);
    assert.deepEqual(alerts(page({ title: null }), page()), [["SEO_ISSUE_RESOLVED", "ERROR", "TITLE_MISSING"]]);
    assert.deepEqual(alerts(page(), page({ h1Count: 2 })), [["SEO_ISSUE_OPENED", "WARNING", "H1_MULTIPLE"]]);
  });

  it("INFO issues never alert", () => {
    assert.deepEqual(alerts(page(), page({ internalLinkCount: 0, robotsTxt: { status: "UNKNOWN", url: null } })), []);
  });

  it("an issue present in both scans does not alert again", () => {
    assert.deepEqual(alerts(page({ title: null }), page({ title: null })), []);
  });
});

describe("SEO schedule", () => {
  it("is due once a day, and immediately for a website never scanned", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    assert.equal(SEO_CHECK_INTERVAL_MS, 24 * 60 * 60 * 1000);
    assert.equal(isSeoCheckDue(null, now), true);
    assert.equal(isSeoCheckDue(new Date(now.getTime() - SEO_CHECK_INTERVAL_MS + 1), now), false);
    assert.equal(isSeoCheckDue(new Date(now.getTime() - SEO_CHECK_INTERVAL_MS), now), true);
  });
});
