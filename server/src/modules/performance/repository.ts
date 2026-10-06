import { prisma } from "../../config/prisma";
import type { PageSpeedResult } from "../../integrations/pagespeed";
import type { PerformanceStrategy } from "./types";
import type { PerformanceAlertCreateInput } from "./alerts";
import { notificationRepository } from "../notification/repository";
import { createEmailIntentForAlert } from "../email-delivery/service";

// Performance checks are manually-triggered only (Stage 13.3) and each one
// is a real, ~10-20s external measurement, so row growth is far slower than
// MonitoringCheck's — a smaller cap than that model's 500 is appropriate,
// while still following the same "bounded, not unbounded" philosophy.
const MAX_HISTORY_RECORDS = 100;

// Deliberately smaller than MAX_HISTORY_RECORDS — stats/trend analysis over
// 30 most-recent checks (per strategy) is a meaningful, bounded sample
// without an unbounded query, per Stage 13.4's explicit recommendation.
const STATS_SAMPLE_SIZE = 30;

export const performanceRepository = {
  // Mirrors monitor/repository.ts's own findActiveWebsites exactly — kept as
  // a small per-module duplicate rather than a cross-module import,
  // consistent with this codebase's established pattern (e.g. verifyOwnership).
  findActiveWebsites: () => {
    return prisma.website.findMany({ where: { isActive: true } });
  },
  // Stage P1: one bounded, index-backed query for ALL active websites' due-
  // check state (not one query per website) — now also grouped by pageUrl,
  // since a website's history may contain manually-tested subpage rows
  // alongside its homepage rows. The caller (the scheduler) is responsible
  // for looking up ONLY the (websiteId, homepageUrl, strategy) entry it
  // cares about — this method itself does not decide which pageUrl is "the
  // homepage" (see worker.ts).
  findLatestCheckTimestamps: (websiteIds: string[]) => {
    return prisma.performanceCheck.groupBy({
      by: ["websiteId", "pageUrl", "strategy"],
      where: { websiteId: { in: websiteIds } },
      _max: { checkedAt: true },
    });
  },
  create: (
    websiteId: string,
    pageUrl: string,
    strategy: PerformanceStrategy,
    result: PageSpeedResult
  ) => {
    return prisma.performanceCheck.create({
      data: {
        websiteId,
        pageUrl,
        strategy,
        ...result,
      },
    });
  },
  // Stage 16.3: fetch one specific check by its own id, with no website/
  // pageUrl/strategy scoping -- ownership is verified separately by the
  // caller (ai-analysis/service.ts) via the row's own websiteId, exactly
  // like every other module's verifyOwnership pattern. Every OTHER method
  // in this file is deliberately scoped by (websiteId, pageUrl, strategy)
  // because it answers "which stream" a query belongs to; this one
  // answers a different question entirely -- "the one exact row the
  // caller already has an id for" -- so it is intentionally unscoped.
  findById: (id: string) => {
    return prisma.performanceCheck.findUnique({ where: { id } });
  },
  // Stage 16.3: the one check immediately BEFORE a given check in true
  // chronological order, within the SAME (websiteId, pageUrl, strategy)
  // stream -- never a different page, strategy, or website, and never a
  // check that happened AFTER `before` (Stage 16.3 §12's explicit
  // correctness requirement: an AI analysis of an older historical check
  // must never be fed a "previous" that is actually from its own future).
  // The (checkedAt, id) compound comparison mirrors seoRepository.findLatest's
  // own tie-break discipline -- two checks sharing an identical millisecond
  // timestamp are still placed in a single deterministic order.
  findImmediatePredecessor: (
    websiteId: string,
    pageUrl: string,
    strategy: PerformanceStrategy,
    before: { checkedAt: Date; id: string }
  ) => {
    return prisma.performanceCheck.findFirst({
      where: {
        websiteId,
        pageUrl,
        strategy,
        OR: [
          { checkedAt: { lt: before.checkedAt } },
          { checkedAt: before.checkedAt, id: { lt: before.id } },
        ],
      },
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    });
  },
  // Stage P1: pageUrl is now part of "which stream" a check belongs to,
  // exactly like strategy already was — a homepage MOBILE latest can never
  // be answered by a /services/ MOBILE row, or vice versa.
  findLatestByWebsiteId: (websiteId: string, pageUrl: string, strategy?: PerformanceStrategy) => {
    return prisma.performanceCheck.findFirst({
      where: { websiteId, pageUrl, ...(strategy ? { strategy } : {}) },
      orderBy: { checkedAt: "desc" },
    });
  },
  findHistoryByWebsiteId: (websiteId: string, pageUrl: string, strategy?: PerformanceStrategy) => {
    return prisma.performanceCheck.findMany({
      where: { websiteId, pageUrl, ...(strategy ? { strategy } : {}) },
      orderBy: { checkedAt: "desc" },
      take: MAX_HISTORY_RECORDS,
    });
  },
  // Bounded by the same MAX_HISTORY_RECORDS cap as above (DESC + take, not a
  // full-table scan) — the caller reverses this to chronological order for
  // charting. `countHistoryByWebsiteIdStrategyAndRange` runs alongside this
  // (not against the fetched rows) so truncation can be reported without
  // ever loading the full range into memory.
  findHistoryByWebsiteIdStrategyAndRange: (
    websiteId: string,
    pageUrl: string,
    strategy: PerformanceStrategy,
    since: Date
  ) => {
    return prisma.performanceCheck.findMany({
      where: { websiteId, pageUrl, strategy, checkedAt: { gte: since } },
      orderBy: { checkedAt: "desc" },
      take: MAX_HISTORY_RECORDS,
    });
  },
  countHistoryByWebsiteIdStrategyAndRange: (
    websiteId: string,
    pageUrl: string,
    strategy: PerformanceStrategy,
    since: Date
  ) => {
    return prisma.performanceCheck.count({
      where: { websiteId, pageUrl, strategy, checkedAt: { gte: since } },
    });
  },
  // Strategy is always required here (never "all") — stats must never mix
  // MOBILE and DESKTOP samples. pageUrl is likewise always required — a
  // stats sample must never blend a website's homepage with any of its
  // manually-tested subpages.
  findRecentByWebsiteIdAndStrategy: (
    websiteId: string,
    pageUrl: string,
    strategy: PerformanceStrategy
  ) => {
    return prisma.performanceCheck.findMany({
      where: { websiteId, pageUrl, strategy },
      orderBy: { checkedAt: "desc" },
      take: STATS_SAMPLE_SIZE,
    });
  },
  // Stage 15.6: a single short DB-only transaction creating the one Alert
  // (at most) a PerformanceCheck transition can produce, together with its
  // recipient IN_APP Notification -- deliberately still separate from
  // `create` above (PerformanceCheck persistence stays outside any
  // transaction to keep the PSI network call unblocked by a held
  // connection), so a failure here can never roll back an already-
  // committed PerformanceCheck row. Mirrors
  // seoRepository.createAlertsWithNotifications exactly, including its
  // retry/duplicate reasoning -- a retried identical transition either
  // fully succeeds or fully fails together, never a partial mix.
  createAlertWithNotification: (alert: PerformanceAlertCreateInput, userId: string) => {
    return prisma.$transaction(async (tx) => {
      const row = await tx.alert.create({ data: alert });
      await notificationRepository.createForAlert(tx, { alertId: row.id, userId });
      // Stage 17.3: same transaction, same (alertId, userId) pair -- IN_APP
      // and EMAIL are independent sibling delivery decisions off the same
      // just-created Alert, never coupled to each other. This transaction
      // has no dependency on AiAnalysis/AI provider/AI output of any kind
      // (Stage 17.3 §20) -- it completes and commits entirely independently
      // of performance/service.ts's separate, later, out-of-transaction
      // maybeRunAutomaticAiAnalysis call.
      await createEmailIntentForAlert(tx, { alertId: row.id, userId });
      return row;
    });
  },
};
