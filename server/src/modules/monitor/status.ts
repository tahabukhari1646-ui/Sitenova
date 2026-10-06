export type MonitoringStatus = "UNKNOWN" | "UP" | "DEGRADED" | "DOWN";

// v1 heuristics — fixed constants, not adaptive or user-configurable.
// See the Stage 11 architecture plan for rationale; revisit if/when
// per-website baselines or configurable thresholds are introduced.
export const FAILURE_CONFIRMATION_THRESHOLD = 2;
export const DEGRADED_RESPONSE_TIME_MS = 3000;

export interface LatestCheckForStatus {
  success: boolean;
  responseTimeMs: number;
}

export interface DeriveMonitoringStatusInput {
  latestCheck: LatestCheckForStatus | null;
  consecutiveFailures: number;
}

// Pure function: no Express, Prisma, HTTP, or database dependency, so it can
// be exercised directly with plain objects. Ordering matters — see Stage 11.2
// scope: a failure only becomes DOWN once consecutiveFailures crosses the
// confirmation threshold; below that, an unconfirmed failure reports UNKNOWN
// rather than DOWN.
export function deriveMonitoringStatus({
  latestCheck,
  consecutiveFailures,
}: DeriveMonitoringStatusInput): MonitoringStatus {
  if (!latestCheck) {
    return "UNKNOWN";
  }

  if (consecutiveFailures >= FAILURE_CONFIRMATION_THRESHOLD) {
    return "DOWN";
  }

  if (!latestCheck.success) {
    return "UNKNOWN";
  }

  return latestCheck.responseTimeMs > DEGRADED_RESPONSE_TIME_MS
    ? "DEGRADED"
    : "UP";
}
