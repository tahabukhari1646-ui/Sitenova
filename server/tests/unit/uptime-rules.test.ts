// Stage 19.2: the pure uptime decision rules -- website status, when an
// incident opens or resolves, and when an alert is raised.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEGRADED_RESPONSE_TIME_MS,
  FAILURE_CONFIRMATION_THRESHOLD,
  deriveMonitoringStatus,
  isUpStatusCode,
} from "../../src/modules/monitor/status";
import { decideIncidentAction } from "../../src/modules/monitor/incidents";
import { decideAlertAction } from "../../src/modules/monitor/alerts";

const ok = (responseTimeMs = 200) => ({ success: true, responseTimeMs });
const failed = { success: false, responseTimeMs: 50 };

describe("deriveMonitoringStatus", () => {
  it("uses the documented thresholds", () => {
    assert.equal(FAILURE_CONFIRMATION_THRESHOLD, 2);
    assert.equal(DEGRADED_RESPONSE_TIME_MS, 3000);
  });

  it("is UNKNOWN before the first check", () => {
    assert.equal(deriveMonitoringStatus({ latestCheck: null, consecutiveFailures: 0 }), "UNKNOWN");
  });

  it("is UP for a fast success and DEGRADED only above 3 seconds", () => {
    assert.equal(deriveMonitoringStatus({ latestCheck: ok(200), consecutiveFailures: 0 }), "UP");
    assert.equal(deriveMonitoringStatus({ latestCheck: ok(3000), consecutiveFailures: 0 }), "UP");
    assert.equal(deriveMonitoringStatus({ latestCheck: ok(3001), consecutiveFailures: 0 }), "DEGRADED");
  });

  it("treats one failure as unconfirmed (UNKNOWN) and two in a row as DOWN", () => {
    assert.equal(deriveMonitoringStatus({ latestCheck: failed, consecutiveFailures: 1 }), "UNKNOWN");
    assert.equal(deriveMonitoringStatus({ latestCheck: failed, consecutiveFailures: 2 }), "DOWN");
    assert.equal(deriveMonitoringStatus({ latestCheck: failed, consecutiveFailures: 9 }), "DOWN");
  });
});

describe("isUpStatusCode", () => {
  it("counts 2xx, 3xx and 4xx as up", () => {
    for (const code of [200, 204, 301, 302, 399, 400, 401, 403, 404, 429, 499]) assert.equal(isUpStatusCode(code), true, String(code));
  });

  it("counts every 5xx server error as down", () => {
    for (const code of [500, 502, 503, 504, 599]) assert.equal(isUpStatusCode(code), false, String(code));
  });
});

describe("decideIncidentAction", () => {
  const checkedAt = new Date("2026-01-01T00:05:00Z");
  const streakStartedAt = new Date("2026-01-01T00:04:00Z");
  const base = { checkedAt, streakStartedAt, hasOpenIncident: false };

  it("does nothing on the first failure", () => {
    assert.deepEqual(decideIncidentAction({ ...base, success: false, consecutiveFailures: 1 }), { type: "none" });
  });

  it("opens an incident on the second failure, dated from the first failure", () => {
    assert.deepEqual(decideIncidentAction({ ...base, success: false, consecutiveFailures: 2 }), {
      type: "create",
      startedAt: streakStartedAt,
    });
  });

  it("falls back to the check time if the streak start is unknown", () => {
    assert.deepEqual(
      decideIncidentAction({ ...base, streakStartedAt: null, success: false, consecutiveFailures: 2 }),
      { type: "create", startedAt: checkedAt }
    );
  });

  it("never opens a second incident while one is open", () => {
    assert.deepEqual(
      decideIncidentAction({ ...base, hasOpenIncident: true, success: false, consecutiveFailures: 5 }),
      { type: "none" }
    );
  });

  it("resolves an open incident on the first success", () => {
    assert.deepEqual(decideIncidentAction({ ...base, hasOpenIncident: true, success: true, consecutiveFailures: 0 }), {
      type: "resolve",
      resolvedAt: checkedAt,
    });
    assert.deepEqual(decideIncidentAction({ ...base, success: true, consecutiveFailures: 0 }), { type: "none" });
  });
});

describe("decideAlertAction", () => {
  it("raises an alert only when an incident opens or resolves", () => {
    assert.deepEqual(decideAlertAction({ type: "create", startedAt: new Date() }), {
      type: "create",
      alertType: "INCIDENT_OPENED",
    });
    assert.deepEqual(decideAlertAction({ type: "resolve", resolvedAt: new Date() }), {
      type: "create",
      alertType: "INCIDENT_RESOLVED",
    });
    assert.deepEqual(decideAlertAction({ type: "none" }), { type: "none" });
  });
});
