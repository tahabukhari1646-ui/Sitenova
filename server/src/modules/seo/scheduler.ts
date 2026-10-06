import cron from "node-cron";
import { runSeoCycle } from "./worker";

// This is a tick rate, not a check interval — the 24h per-website cadence
// lives in due.ts's SEO_CHECK_INTERVAL_MS and is enforced by isSeoCheckDue
// on every tick. Hourly is frequent enough that a due check runs promptly
// (at most ~1h after becoming due) without re-querying due-state as often
// as uptime's every-minute cycle or performance's every-15-minutes, which
// would be wasteful for a check that only needs to happen once a day.
const SEO_SCHEDULER_CRON_EXPRESSION = "0 * * * *";

export function startSeoScheduler(): void {
  cron.schedule(SEO_SCHEDULER_CRON_EXPRESSION, () => {
    runSeoCycle().catch((error) => {
      console.error("SEO cycle failed:", error);
    });
  });
}
