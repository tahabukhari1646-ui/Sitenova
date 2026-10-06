// V1 cadence: one automatic SEO check per active website every 24 hours.
// Centralized here so no magic number is scattered across worker/scheduler.
export const SEO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Pure and DB-free by design (mirrors performance/due.ts's own
// isPerformanceCheckDue exactly) — testable with plain Date values, no
// seeded rows or mocks required. A null `latestCheckedAt` means "never
// checked" -> always due. A recent manual check naturally delays the next
// automatic run because both share the same SeoCheck history this reads
// from — no separate lastAutomaticSeoCheckAt is needed.
export function isSeoCheckDue(latestCheckedAt: Date | null, now: Date = new Date()): boolean {
  if (latestCheckedAt === null) return true;
  return now.getTime() - latestCheckedAt.getTime() >= SEO_CHECK_INTERVAL_MS;
}
