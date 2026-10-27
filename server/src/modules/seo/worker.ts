import { seoRepository } from "./repository";
import { seoService } from "./service";
import { aiAnalysisService } from "../ai-analysis/service";
import { isSeoCheckDue } from "./due";
import { safeCanonicalize } from "../../utils/pageUrl";

function timestampKey(websiteId: string, pageUrl: string): string {
  return `${websiteId}:${pageUrl}`;
}

// Same-process overlap guard: each SEO check can make up to 3 outbound
// requests (page, robots.txt, sitemap) and a cycle covering many due
// websites can run for a while — long enough to still be in progress when
// the next cron tick fires. A single in-memory flag is sufficient here
// because this process is the only writer of SeoCheck rows via the
// scheduler. It does NOT protect against multiple server instances/
// processes each running their own scheduler (horizontal scaling) — that
// would require a distributed lock (e.g. a Postgres advisory lock or
// Redis), deliberately not introduced in this stage.
let isCycleRunning = false;

export async function runSeoCycle(): Promise<void> {
  if (isCycleRunning) {
    console.log("SEO cycle skipped: previous cycle is still running.");
    return;
  }

  isCycleRunning = true;
  const startedAt = Date.now();

  try {
    const websites = await seoRepository.findActiveWebsites();
    const latestTimestamps = await seoRepository.findLatestCheckTimestamps(
      websites.map((website) => website.id)
    );

    // Stage P2 (critical, mirrors Performance's Stage P1 §44 fix exactly):
    // keyed by pageUrl too, so a website's history of manually-tested
    // subpages can never influence due-calculation -- the lookup below
    // always asks for THIS website's own homepage pageUrl specifically,
    // never "whatever page was checked most recently".
    const latestByKey = new Map<string, Date>();
    for (const row of latestTimestamps) {
      if (row._max.checkedAt) {
        latestByKey.set(timestampKey(row.websiteId, row.pageUrl), row._max.checkedAt);
      }
    }

    let dueCount = 0;
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    // Sequential by design (no Promise.all) — one SEO check (up to 3
    // outbound requests) in flight at a time, to keep target-site load,
    // resource spikes, and connection pressure predictable. A single
    // website's failure is caught per-iteration so it can never abort the
    // rest of the cycle.
    for (const website of websites) {
      // Always the website's OWN homepage, never a manually-tested
      // subpage's pageUrl -- automatic scheduling never enrolls a
      // subpage (Stage P2), and a recent manual homepage check still
      // correctly delays the next automatic homepage run, since both
      // write the identical safeCanonicalize(website.url) pageUrl.
      const homepageUrl = safeCanonicalize(website.url);
      const latestCheckedAt = latestByKey.get(timestampKey(website.id, homepageUrl)) ?? null;

      if (!isSeoCheckDue(latestCheckedAt)) {
        skippedCount++;
        continue;
      }

      dueCount++;
      try {
        const created = await seoService.runAutomaticSeoCheck(website);
        successCount++;

        // Stage 18.8: optional AI enrichment AFTER the check, its issues and
        // its alerts are already saved -- monitoring is authoritative, AI
        // never decides whether a check/alert exists. Called here (the
        // scheduler only, never a manual "Run SEO check"), and isolated in
        // its own try/catch so an AI problem can never fail this check or
        // abort the cycle. Logged by id only.
        try {
          await aiAnalysisService.analyzeSeoCheckAutomatically(created);
        } catch (aiError) {
          console.error(
            `Automatic SEO AI analysis errored for website ${website.id}, SEO check ${created.id}:`,
            aiError instanceof Error ? aiError.message : "Unknown error"
          );
        }
      } catch (error) {
        failureCount++;
        // Only the curated error message is logged (never a raw stack
        // trace or SafeFetchError internals, which could contain resolved
        // IPs/DNS detail) — see seo/service.ts's mapSafeFetchError, whose
        // curated messages are exactly what surfaces here.
        console.error(
          `SEO check failed for website ${website.id}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `SEO cycle complete: ${websites.length} active website(s), ${dueCount} due, ` +
        `${successCount} succeeded, ${failureCount} failed, ${skippedCount} skipped (not due). ` +
        `Duration: ${durationMs}ms.`
    );
  } finally {
    isCycleRunning = false;
  }
}
