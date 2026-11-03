// Stage 19.3: the pure performance rules -- how metrics are rated, how the
// Core Web Vitals rating combines, when an alert is raised, and when a
// check is due.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rateCls,
  rateCoreWebVitals,
  rateInp,
  rateLcp,
  ratePerformanceScore,
  rateTbt,
  type PerformanceRating,
} from "../../src/modules/performance/ratings";
import { derivePerformanceAlert } from "../../src/modules/performance/alerts";
import { derivePerformanceDegradationTransition } from "../../src/modules/performance/degradation";
import { isPerformanceCheckDue, PERFORMANCE_CHECK_INTERVAL_MS } from "../../src/modules/performance/due";

describe("metric ratings", () => {
  it("LCP: up to 2500 ms good, up to 4000 needs improvement, above that poor", () => {
    assert.deepEqual([2500, 2501, 4000, 4001].map(rateLcp), ["GOOD", "NEEDS_IMPROVEMENT", "NEEDS_IMPROVEMENT", "POOR"]);
  });

  it("INP: 200 / 500 ms", () => {
    assert.deepEqual([200, 201, 500, 501].map(rateInp), ["GOOD", "NEEDS_IMPROVEMENT", "NEEDS_IMPROVEMENT", "POOR"]);
  });

  it("CLS: 0.1 / 0.25", () => {
    assert.deepEqual([0.1, 0.11, 0.25, 0.26].map(rateCls), ["GOOD", "NEEDS_IMPROVEMENT", "NEEDS_IMPROVEMENT", "POOR"]);
  });

  it("performance score: 90+ good, 50+ needs improvement", () => {
    assert.deepEqual([90, 89, 50, 49].map(ratePerformanceScore), ["GOOD", "NEEDS_IMPROVEMENT", "NEEDS_IMPROVEMENT", "POOR"]);
  });

  it("missing values are UNKNOWN, never guessed; TBT has no official rating", () => {
    for (const rate of [rateLcp, rateInp, rateCls, ratePerformanceScore]) assert.equal(rate(null), "UNKNOWN");
    assert.equal(rateTbt(100), "UNKNOWN");
  });
});

describe("Core Web Vitals rating (LCP + INP + CLS)", () => {
  it("GOOD only when all three are present and good", () => {
    assert.equal(rateCoreWebVitals(1000, 100, 0.01), "GOOD");
    assert.equal(rateCoreWebVitals(1000, 100, null), "UNKNOWN");
  });

  it("any POOR metric makes it POOR, even if others are missing", () => {
    assert.equal(rateCoreWebVitals(6000, 100, 0.01), "POOR");
    assert.equal(rateCoreWebVitals(null, null, 0.5), "POOR");
  });

  it("NEEDS_IMPROVEMENT only with all three present", () => {
    assert.equal(rateCoreWebVitals(3000, 100, 0.01), "NEEDS_IMPROVEMENT");
    assert.equal(rateCoreWebVitals(3000, null, 0.01), "UNKNOWN");
  });

  it("no field data at all is UNKNOWN", () => {
    assert.equal(rateCoreWebVitals(null, null, null), "UNKNOWN");
  });
});

describe("performance alert rules", () => {
  const alert = (previous: PerformanceRating | null, current: PerformanceRating, pageUrl = "https://a.example/") => {
    const result = derivePerformanceAlert("website-1", "check-1", pageUrl, "MOBILE", previous, current);
    return result && [result.type, result.severity, result.code, result.message];
  };

  it("getting worse raises PERFORMANCE_DEGRADED (WARNING, or ERROR when poor)", () => {
    assert.deepEqual(alert("GOOD", "NEEDS_IMPROVEMENT"), [
      "PERFORMANCE_DEGRADED", "WARNING", "MOBILE_CORE_WEB_VITALS", "Mobile Core Web Vitals degraded from Good to Needs Improvement.",
    ]);
    assert.deepEqual(alert("GOOD", "POOR")?.slice(0, 2), ["PERFORMANCE_DEGRADED", "ERROR"]);
    assert.deepEqual(alert("NEEDS_IMPROVEMENT", "POOR")?.slice(0, 2), ["PERFORMANCE_DEGRADED", "ERROR"]);
  });

  it("getting better raises PERFORMANCE_RECOVERED (INFO when good)", () => {
    assert.deepEqual(alert("POOR", "GOOD")?.slice(0, 2), ["PERFORMANCE_RECOVERED", "INFO"]);
    assert.deepEqual(alert("POOR", "NEEDS_IMPROVEMENT")?.slice(0, 2), ["PERFORMANCE_RECOVERED", "WARNING"]);
  });

  it("no alert for the first check, unchanged ratings, or anything UNKNOWN", () => {
    assert.equal(alert(null, "POOR"), null);
    assert.equal(alert("POOR", "POOR"), null);
    assert.equal(alert("UNKNOWN", "POOR"), null);
    assert.equal(alert("GOOD", "UNKNOWN"), null);
  });

  it("names the page when it is not the homepage, and the desktop code differs", () => {
    assert.match(String(alert("GOOD", "POOR", "https://a.example/shop/")?.[3]), / for \/shop\/ /);
    assert.equal(derivePerformanceAlert("w", "c", "https://a.example/", "DESKTOP", "GOOD", "POOR")?.code, "DESKTOP_CORE_WEB_VITALS");
  });

  it("the automatic-AI trigger fires only when entering a worse rating", () => {
    const entered = (p: PerformanceRating | null, c: PerformanceRating) => derivePerformanceDegradationTransition(p, c).enteredDegraded;
    assert.equal(entered("GOOD", "POOR"), true);
    assert.equal(entered("GOOD", "NEEDS_IMPROVEMENT"), true);
    assert.equal(entered("POOR", "GOOD"), false);
    assert.equal(entered("POOR", "POOR"), false);
    assert.equal(entered(null, "POOR"), false);
    assert.equal(entered("UNKNOWN", "POOR"), false);
  });
});

describe("performance schedule", () => {
  it("mobile every 6 hours, desktop every 12, immediately if never checked", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const ago = (ms: number) => new Date(now.getTime() - ms);
    assert.equal(PERFORMANCE_CHECK_INTERVAL_MS.MOBILE, 6 * 60 * 60 * 1000);
    assert.equal(PERFORMANCE_CHECK_INTERVAL_MS.DESKTOP, 12 * 60 * 60 * 1000);
    assert.equal(isPerformanceCheckDue("MOBILE", null, now), true);
    assert.equal(isPerformanceCheckDue("MOBILE", ago(6 * 60 * 60 * 1000 - 1), now), false);
    assert.equal(isPerformanceCheckDue("MOBILE", ago(6 * 60 * 60 * 1000), now), true);
    assert.equal(isPerformanceCheckDue("DESKTOP", ago(6 * 60 * 60 * 1000), now), false);
  });
});
