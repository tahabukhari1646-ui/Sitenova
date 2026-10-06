import cron from "node-cron";
import { runMonitoringCycle } from "./worker";

export function startMonitoringScheduler(): void {
  cron.schedule("* * * * *", () => {
    runMonitoringCycle().catch((error) => {
      console.error("Monitoring cycle failed:", error);
    });
  });
}
