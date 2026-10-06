import { performanceRepository } from "./repository";
import { performanceService } from "./service";
import { isPerformanceCheckDue } from "./due";
import { safeCanonicalize } from "../../utils/pageUrl";
import type { PerformanceStrategy } from "./types";

const STRATEGIES: PerformanceStrategy[] = ["MOBILE", "DESKTOP"];

function timestampKey(websiteId: string, pageUrl: string, strategy: string): string {
  return `${websiteId}:${pageUrl}:${strategy}`;
}

// Same-process overlap guard: PSI calls can take up to 45s each, and a cycle
// covering many due websites/strategies can run for minutes — long enough to
// still be in progress when the next cron tick fires. A single in-memory
// flag is sufficient here because this process is the only writer of
// PerformanceCheck rows via the scheduler. It does NOT protect against
// multiple server instances/processes each running their own scheduler
// (horizontal scaling) — that would require a distributed lock (e.g. a
// Postgres advisory lock or Redis), deliberately not introduced in this
// stage per Stage 13.8's scope.
let isCycleRunning = false;

export async function runPerformanceCycle(): Promise<void> {
  if (isCycleRunning) {
    console.log("Performance cycle skipped: previous cycle is still running.");
    return;
  }

  isCycleRunning = true;
  const startedAt = Date.now();

  try {
    const websites = await performanceRepository.findActiveWebsites();
    const latestTimestamps = await performanceRepository.findLatestCheckTimestamps(
      websites.map((website) => website.id)
    );

    // Stage P1 §44 (critical): keyed by pageUrl too, so a website's history
    // of manually-tested subpages can never influence due-calculation --
    // the lookup below always asks for THIS website's own homepage pageUrl
    // specifically, never "whatever page was checked most recently".
    const latestByKey = new Map<string, Date>();
    for (const row of latestTimestamps) {
      if (row._max.checkedAt) {
        latestByKey.set(timestampKey(row.websiteId, row.pageUrl, row.strategy), row._max.checkedAt);
      }
    }

    let dueCount = 0;
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    // Sequential by design (no Promise.all) — one PSI call in flight at a
    // time, matching the existing uptime worker's own for-of/await pattern.
    // A single website/strategy failure is caught per-iteration so it can
    // never abort the rest of the cycle.
    for (const website of websites) {
      // Always the website's OWN homepage, never a manually-tested
      // subpage's pageUrl -- automatic scheduling never enrolls a
      // subpage (Stage P1 §16/§17), and a recent manual homepage test
      // still correctly delays the next automatic homepage run, since
      // both write the identical safeCanonicalize(website.url) pageUrl.
      const homepageUrl = safeCanonicalize(website.url);

      for (const strategy of STRATEGIES) {
        const latestCheckedAt = latestByKey.get(timestampKey(website.id, homepageUrl, strategy)) ?? null;

        if (!isPerformanceCheckDue(strategy, latestCheckedAt)) {
          skippedCount++;
          continue;
        }

        dueCount++;
        try {
          await performanceService.runAutomaticCheck(website, strategy);
          successCount++;
        } catch (error) {
          failureCount++;
          // Only the curated PageSpeedError message is logged (never the
          // raw fetch error, which could contain the key-bearing PSI URL —
          // see integrations/pagespeed.ts) — no PSI response body, no keys.
          console.error(
            `Performance check failed for website ${website.id} (${strategy}):`,
            error instanceof Error ? error.message : "Unknown error"
          );
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `Performance cycle complete: ${websites.length} active website(s), ${dueCount} due, ` +
        `${successCount} succeeded, ${failureCount} failed, ${skippedCount} skipped (not due). ` +
        `Duration: ${durationMs}ms.`
    );
  } finally {
    isCycleRunning = false;
  }
}
