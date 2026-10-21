import { createHash } from "node:crypto";
import type { IncidentAiInput } from "./types";

// Stage 18.5: deterministic fingerprint of an IncidentAiInput -- same
// discipline as fingerprint.ts / seo-fingerprint.ts: measured facts only (no
// provider/model), every object rebuilt with a fixed key order. An OPEN
// incident's fingerprint naturally changes as new checks arrive; each
// manual analysis describes the incident as of that moment.

export function computeIncidentAiInputFingerprint(input: IncidentAiInput): string {
  const ref = (r: IncidentAiInput["baseline24h"]["lastSuccessBefore"]) =>
    r === null ? null : { checkedAt: r.checkedAt, statusCode: r.statusCode, responseTimeMs: r.responseTimeMs };

  const canonical = {
    incident: {
      status: input.incident.status,
      startedAt: input.incident.startedAt,
      resolvedAt: input.incident.resolvedAt,
      durationMs: input.incident.durationMs,
      observedUntil: input.incident.observedUntil,
    },
    monitoring: {
      checkIntervalSeconds: input.monitoring.checkIntervalSeconds,
      failureConfirmationThreshold: input.monitoring.failureConfirmationThreshold,
      requestTimeoutMs: input.monitoring.requestTimeoutMs,
      timeoutCeilingMs: input.monitoring.timeoutCeilingMs,
      degradedThresholdMs: input.monitoring.degradedThresholdMs,
      vantagePoints: input.monitoring.vantagePoints,
      failureReasonRecorded: input.monitoring.failureReasonRecorded,
      httpErrorsCountAsUp: input.monitoring.httpErrorsCountAsUp,
    },
    window: {
      totalChecks: input.window.totalChecks,
      failedChecks: input.window.failedChecks,
      timeoutFailures: input.window.timeoutFailures,
      fastFailures: input.window.fastFailures,
      failedResponseTimeMs: input.window.failedResponseTimeMs
        ? {
            min: input.window.failedResponseTimeMs.min,
            median: input.window.failedResponseTimeMs.median,
            max: input.window.failedResponseTimeMs.max,
          }
        : null,
    },
    sampleChecks: [...input.sampleChecks]
      .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt))
      .map((c) => ({
        checkedAt: c.checkedAt,
        success: c.success,
        statusCode: c.statusCode,
        responseTimeMs: c.responseTimeMs,
        hitTimeoutCeiling: c.hitTimeoutCeiling,
      })),
    baseline24h: {
      checks: input.baseline24h.checks,
      successRate: input.baseline24h.successRate,
      medianResponseTimeMs: input.baseline24h.medianResponseTimeMs,
      slowChecks: input.baseline24h.slowChecks,
      lastSuccessBefore: ref(input.baseline24h.lastSuccessBefore),
    },
    recovery: { firstSuccess: ref(input.recovery.firstSuccess) },
    history: { otherIncidentsLast30Days: input.history.otherIncidentsLast30Days },
  };

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
