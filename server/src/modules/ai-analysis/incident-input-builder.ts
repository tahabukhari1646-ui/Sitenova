import { monitorRepository } from "../monitor/repository";
import { REQUEST_TIMEOUT_MS } from "../monitor/service";
import { DEGRADED_RESPONSE_TIME_MS, FAILURE_CONFIRMATION_THRESHOLD } from "../monitor/status";
import type { IncidentAiCheck, IncidentAiCheckRef, IncidentAiInput } from "./types";
import type { Incident } from "../../generated/prisma/client";

// Stage 18.5: the ONE place a stored Incident becomes the provider-
// independent IncidentAiInput. Reuses the monitoring module's own constants
// (never copies of them). The pure `buildIncidentAiInput` only shapes facts;
// `loadIncidentAiInput` gathers those facts through bounded, read-only
// monitorRepository queries.

// Matches monitor/scheduler.ts's "* * * * *" cron (one check per minute).
const CHECK_INTERVAL_SECONDS = 60;
// A failed check that took >= 95% of the request timeout is treated as
// "did not respond in time"; anything faster failed before the timeout
// (connection refused / DNS / TLS -- which one is NOT recorded).
const TIMEOUT_CEILING_MS = Math.floor(REQUEST_TIMEOUT_MS * 0.95);
const SAMPLE_EACH_END = 10;
const BASELINE_WINDOW_MS = 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type RawCheck = { id: string; checkedAt: Date; success: boolean; statusCode: number | null; responseTimeMs: number };
type RawCheckRef = { checkedAt: Date; statusCode: number | null; responseTimeMs: number };

export interface IncidentAiFacts {
  incident: Incident;
  windowStats: {
    total: number;
    failed: number;
    server_errors: number;
    timeouts: number;
    fast: number;
    min_rt: number | null;
    median_rt: number | null;
    max_rt: number | null;
    last_at: Date | null;
  };
  firstChecks: RawCheck[];
  lastChecks: RawCheck[];
  baseline: { total: number; successful: number; median_rt: number | null; slow: number };
  lastSuccessBefore: RawCheckRef | null;
  firstSuccessAfter: RawCheckRef | null;
  otherIncidentsLast30Days: number;
}

const knownMs = (ms: number): number | null => (ms >= 0 ? ms : null);

function toCheckRef(check: RawCheckRef | null): IncidentAiCheckRef | null {
  if (!check) return null;
  return {
    checkedAt: check.checkedAt.toISOString(),
    statusCode: check.statusCode,
    responseTimeMs: knownMs(check.responseTimeMs),
  };
}

function toAiCheck(check: RawCheck): IncidentAiCheck {
  const responseTimeMs = knownMs(check.responseTimeMs);
  return {
    checkedAt: check.checkedAt.toISOString(),
    success: check.success,
    statusCode: check.statusCode,
    responseTimeMs,
    hitTimeoutCeiling:
      !check.success && check.statusCode === null && responseTimeMs !== null && responseTimeMs >= TIMEOUT_CEILING_MS,
  };
}

// Pure: same facts always produce the same input.
export function buildIncidentAiInput(facts: IncidentAiFacts): IncidentAiInput {
  const { incident, windowStats: w, baseline: b } = facts;

  // First N + last N, de-duplicated (short incidents overlap), oldest first.
  const byId = new Map<string, RawCheck>();
  for (const c of [...facts.firstChecks, ...facts.lastChecks]) byId.set(c.id, c);
  const sample = [...byId.values()].sort(
    (x, y) => x.checkedAt.getTime() - y.checkedAt.getTime() || x.id.localeCompare(y.id)
  );

  const resolved = incident.status === "RESOLVED" && incident.resolvedAt !== null;

  return {
    incident: {
      status: incident.status,
      startedAt: incident.startedAt.toISOString(),
      resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
      durationMs: resolved ? incident.resolvedAt!.getTime() - incident.startedAt.getTime() : null,
      observedUntil: w.last_at ? new Date(w.last_at).toISOString() : null,
    },
    monitoring: {
      checkIntervalSeconds: CHECK_INTERVAL_SECONDS,
      failureConfirmationThreshold: FAILURE_CONFIRMATION_THRESHOLD,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      timeoutCeilingMs: TIMEOUT_CEILING_MS,
      degradedThresholdMs: DEGRADED_RESPONSE_TIME_MS,
      vantagePoints: 1,
      failureReasonRecorded: false,
      serverErrorsCountAsDown: true,
    },
    window: {
      totalChecks: w.total,
      failedChecks: w.failed,
      serverErrorFailures: w.server_errors,
      timeoutFailures: w.timeouts,
      fastFailures: w.fast,
      failedResponseTimeMs:
        w.min_rt !== null && w.median_rt !== null && w.max_rt !== null
          ? { min: w.min_rt, median: w.median_rt, max: w.max_rt }
          : null,
    },
    sampleChecks: sample.map(toAiCheck),
    baseline24h: {
      checks: b.total,
      successRate: b.total > 0 ? Math.round((b.successful / b.total) * 10000) / 100 : null,
      medianResponseTimeMs: b.median_rt,
      slowChecks: b.slow,
      lastSuccessBefore: toCheckRef(facts.lastSuccessBefore),
    },
    recovery: { firstSuccess: resolved ? toCheckRef(facts.firstSuccessAfter) : null },
    history: { otherIncidentsLast30Days: facts.otherIncidentsLast30Days },
  };
}

// Gathers the facts for one already ownership-verified incident. The window
// is [startedAt, resolvedAt) for a resolved incident (the recovering success
// at resolvedAt is reported separately as recovery.firstSuccess), or
// [startedAt, now) while it is still open.
export async function loadIncidentAiInput(incident: Incident): Promise<IncidentAiInput> {
  const from = incident.startedAt;
  const to = incident.resolvedAt ?? new Date();
  const websiteId = incident.websiteId;

  const [windowStats, firstChecks, lastChecks, baseline, lastSuccessBefore, firstSuccessAfter, otherIncidentsLast30Days] =
    await Promise.all([
      monitorRepository.getIncidentWindowStats(websiteId, from, to, TIMEOUT_CEILING_MS),
      monitorRepository.findIncidentWindowSample(websiteId, from, to, SAMPLE_EACH_END, "asc"),
      monitorRepository.findIncidentWindowSample(websiteId, from, to, SAMPLE_EACH_END, "desc"),
      monitorRepository.getBaselineStats(
        websiteId,
        new Date(from.getTime() - BASELINE_WINDOW_MS),
        from,
        DEGRADED_RESPONSE_TIME_MS
      ),
      monitorRepository.findLastSuccessBefore(websiteId, from),
      incident.resolvedAt
        ? monitorRepository.findFirstSuccessAtOrAfter(websiteId, incident.resolvedAt)
        : Promise.resolve(null),
      monitorRepository.countOtherIncidentsSince(
        websiteId,
        new Date(from.getTime() - HISTORY_WINDOW_MS),
        incident.id
      ),
    ]);

  return buildIncidentAiInput({
    incident,
    windowStats,
    firstChecks,
    lastChecks,
    baseline,
    lastSuccessBefore,
    firstSuccessAfter,
    otherIncidentsLast30Days,
  });
}
