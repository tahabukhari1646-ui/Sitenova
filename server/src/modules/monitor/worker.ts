import { monitorService } from "./service";

// Stage 15.8: fresh audit discovered that saveCheckResult's transaction can
// genuinely throw under real concurrent-overlap load -- a forced-race test
// proved the hand-written incidents_website_open_unique partial index
// correctly rejects the losing concurrent transaction with a unique-
// constraint violation (P2002), fully rolling back that attempt (no
// partial/duplicate Incident, Alert, or MonitoringCheck survives). That
// part is safe and self-healing by design, not a bug.
//
// The bug: this loop previously had no per-website try/catch, so that
// P2002 (or any other single-website failure, unrelated to concurrency)
// would propagate out of the whole function and abort every SUBSEQUENT
// website in the same cycle, not just the one that failed -- reproduced
// directly before this fix. SEO's and Performance's own workers already
// isolate failures per-website; this brings Uptime's worker up to the
// same standard. This does NOT add an overlap guard (isCycleRunning) --
// that remains a deliberately separate, larger architectural question,
// not required to fix this narrower, concurrency-independent bug.
export async function runMonitoringCycle(): Promise<void> {
  const websites = await monitorService.getActiveWebsites();

  for (const website of websites) {
    try {
      const result = await monitorService.checkWebsite(website.id, website.url);
      await monitorService.saveCheckResult(result);
    } catch (error) {
      // Never log a raw driver/Prisma error object (could embed internal
      // detail) -- only its message, matching every other worker's
      // established logging discipline in this codebase.
      console.error(
        `Monitoring check failed for website ${website.id}:`,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
}
