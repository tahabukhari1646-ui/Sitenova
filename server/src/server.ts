import "dotenv/config";
import app from "./app";
import { startMonitoringScheduler } from "./modules/monitor/scheduler";
import { startPerformanceScheduler } from "./modules/performance/scheduler";
import { startSeoScheduler } from "./modules/seo/scheduler";
import { startEmailDeliveryScheduler } from "./modules/email-delivery/scheduler";

const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

startMonitoringScheduler();
startPerformanceScheduler();
startSeoScheduler();
startEmailDeliveryScheduler();
