import cron from "node-cron";
import { runPerformanceCycle } from "./worker";

// This is a tick rate, not a check interval — the 6h/12h MOBILE/DESKTOP
// cadence lives in due.ts's PERFORMANCE_CHECK_INTERVAL_MS and is enforced by
// isPerformanceCheckDue on every tick. Every 15 minutes is frequent enough
// that a due check runs promptly (at most ~15min after becoming due)
// without re-querying due-state as often as uptime's every-60s cycle, which
// would be wasteful for a check that only needs to happen a few times a day.
const PERFORMANCE_SCHEDULER_CRON_EXPRESSION = "*/15 * * * *";

export function startPerformanceScheduler(): void {
  cron.schedule(PERFORMANCE_SCHEDULER_CRON_EXPRESSION, () => {
    runPerformanceCycle().catch((error) => {
      console.error("Performance cycle failed:", error);
    });
  });
}
