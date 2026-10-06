import type { PerformanceStrategy } from "./types";

// v1 cadence — deliberately conservative relative to uptime's 60s cycle.
// At 18 active websites (current count), this is ~108 PSI calls/day against
// PageSpeed Insights' verified default quota of 25,000/day — under 0.5%
// utilization, safe with substantial headroom for growth. DESKTOP runs half
// as often as MOBILE since mobile performance is the more commonly-cited
// priority metric and field/CrUX data changes slowly regardless.
export const PERFORMANCE_CHECK_INTERVAL_MS: Record<PerformanceStrategy, number> = {
  MOBILE: 6 * 60 * 60 * 1000,
  DESKTOP: 12 * 60 * 60 * 1000,
};

// Pure and DB-free by design (mirrors monitor/status.ts's decision-function
// pattern) — testable with plain Date values, no seeded rows or mocks
// required. A null `latestCheckedAt` means "never checked" -> always due.
// A recent manual check naturally delays the next automatic run because
// both share the same PerformanceCheck history this reads from.
export function isPerformanceCheckDue(
  strategy: PerformanceStrategy,
  latestCheckedAt: Date | null,
  now: Date = new Date()
): boolean {
  if (latestCheckedAt === null) return true;
  return now.getTime() - latestCheckedAt.getTime() >= PERFORMANCE_CHECK_INTERVAL_MS[strategy];
}
