import cron from "node-cron";
import { emailDeliveryRepository } from "./repository";
import { processEmailDelivery } from "./worker";

// Every minute -- matches monitor/scheduler.ts's own tick rate exactly
// (the established precedent for the tightest existing interval in this
// codebase). A transactional alert email being flushed within ~60s of its
// triggering Alert is more than adequate for V1; this is a tick rate, not
// a per-delivery SLA -- unlike Performance/SEO's own "due" scheduling,
// EVERY pending row found on a tick is eligible immediately (there is no
// per-delivery cooldown concept here).
const EMAIL_DELIVERY_CRON_EXPRESSION = "* * * * *";

// Bounded batch per cycle -- same "fixed latest/oldest N, not unbounded"
// philosophy as every other domain's own history/polling query
// (Stage 17.2's own MAX_PENDING_BATCH cap is still the hard ceiling this
// value can never exceed, enforced inside findPending itself).
const BATCH_SIZE = 20;

// Same-process overlap guard (Stage 17.5 §24) -- mirrors performance/
// worker.ts's isCycleRunning precedent exactly, including its documented
// limitation: this only prevents redundant work WITHIN one Node process.
// It is NOT the concurrency-correctness boundary -- that is
// emailDeliveryRepository.claimDelivery's atomic conditional UPDATE
// (Stage 17.2), which remains correct even across multiple server
// processes/horizontal scaling where this in-memory flag provides no
// protection at all (Stage 17.5 §9).
let isCycleRunning = false;

export async function runEmailDeliveryCycle(): Promise<void> {
  if (isCycleRunning) {
    console.log("Email delivery cycle skipped: previous cycle is still running.");
    return;
  }

  isCycleRunning = true;
  const startedAt = Date.now();

  try {
    const pending = await emailDeliveryRepository.findPending(BATCH_SIZE);

    let sentCount = 0;
    let failedCount = 0;
    let notClaimedCount = 0;

    // Sequential by design (Stage 17.5 §22) -- no Promise.all, matching
    // the existing uptime/performance workers' own for-of/await
    // precedent. One delivery's failure is isolated per-iteration so it
    // can never abort the rest of the batch (Stage 17.5 §40).
    for (const delivery of pending) {
      try {
        const outcome = await processEmailDelivery(delivery.id);
        if (outcome === "SENT") sentCount++;
        else if (outcome === "FAILED") failedCount++;
        else notClaimedCount++;
      } catch (error) {
        // Stage 17.5 §41: an error reaching this catch is, by
        // processEmailDelivery's own contract, NOT an expected
        // payload/provider failure (those are already handled internally
        // and never thrown this far) -- it is an unexpected
        // programming/database failure. Logged and isolated to this one
        // delivery only; never used to mark OTHER deliveries FAILED,
        // never allowed to crash the scheduler or the server process.
        console.error(
          `Email delivery ${delivery.id} processing failed unexpectedly:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `Email delivery cycle complete: ${pending.length} pending found, ${sentCount} sent, ` +
        `${failedCount} failed, ${notClaimedCount} already claimed. Duration: ${durationMs}ms.`
    );
  } finally {
    isCycleRunning = false;
  }
}

export function startEmailDeliveryScheduler(): void {
  cron.schedule(EMAIL_DELIVERY_CRON_EXPRESSION, () => {
    runEmailDeliveryCycle().catch((error) => {
      console.error("Email delivery cycle failed:", error);
    });
  });
}
