import { prisma } from "../../config/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { SeoCheckCreateData } from "./types";
import type { SeoAlertCreateInput } from "./alerts";
import { notificationRepository } from "../notification/repository";
import { createEmailIntentForAlert } from "../email-delivery/service";

// Matches Stage 13.7's Performance History cap exactly (100) — no stronger
// reason surfaced during Stage 14.6 inspection to deviate from that
// established precedent.
export const MAX_HISTORY_RECORDS = 100;

export const seoRepository = {
  // Mirrors performanceRepository.findActiveWebsites/monitorRepository's own
  // findActiveWebsites exactly — kept as a small per-module duplicate rather
  // than a cross-module import, consistent with this codebase's established
  // pattern (e.g. verifyOwnership).
  findActiveWebsites: () => {
    return prisma.website.findMany({ where: { isActive: true } });
  },
  // Stage P2: now grouped by [websiteId, pageUrl] (not just websiteId) --
  // the caller (the scheduler) is responsible for looking up ONLY the
  // (websiteId, homepageUrl) entry it cares about, exactly mirroring
  // performanceRepository.findLatestCheckTimestamps's own Stage P1 §44
  // isolation fix. This method itself does not decide which pageUrl is
  // "the homepage" (see worker.ts).
  findLatestCheckTimestamps: (websiteIds: string[]) => {
    return prisma.seoCheck.groupBy({
      by: ["websiteId", "pageUrl"],
      where: { websiteId: { in: websiteIds } },
      _max: { checkedAt: true },
    });
  },
  create: (websiteId: string, data: SeoCheckCreateData) => {
    return prisma.seoCheck.create({
      data: {
        websiteId,
        ...data,
        // Prisma's generated Json input type requires an index-signature-
        // compatible shape; SeoStructuredData's fixed-property interface is
        // structurally a valid JSON value but TypeScript won't infer that
        // automatically — this cast doesn't change what's stored (Prisma
        // still serializes the exact object as-is into the JSONB column).
        structuredData: data.structuredData as unknown as Prisma.InputJsonValue,
      },
    });
  },
  // Stage P2: pageUrl is now part of "which stream" a check belongs to --
  // a homepage latest can never be answered by a /morrisons/ row, or vice
  // versa. checkedAt DESC alone could tie (two checks in the same
  // millisecond is not impossible); id DESC as a secondary key keeps
  // ordering fully deterministic rather than relying on undefined
  // tie-break behavior.
  findLatest: (websiteId: string, pageUrl: string) => {
    return prisma.seoCheck.findFirst({
      where: { websiteId, pageUrl },
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    });
  },
  // Stage 18.3: read-only, additive -- used only by the SEO AI diagnosis.
  // "The one exact row the caller already has an id for", intentionally
  // unscoped (mirrors performanceRepository.findById); the caller MUST
  // cross-check the returned row's websiteId against an already
  // ownership-verified website before using it.
  findById: (id: string) => {
    return prisma.seoCheck.findUnique({ where: { id } });
  },
  // Stage 18.3: read-only, additive. The check immediately BEFORE `before`
  // within the SAME (websiteId, pageUrl) stream -- never another page or
  // website, and never a check from `before`'s own future. Same (checkedAt,
  // id) compound tie-break as findLatest above and as
  // performanceRepository.findImmediatePredecessor.
  findImmediatePredecessor: (
    websiteId: string,
    pageUrl: string,
    before: { checkedAt: Date; id: string }
  ) => {
    return prisma.seoCheck.findFirst({
      where: {
        websiteId,
        pageUrl,
        OR: [
          { checkedAt: { lt: before.checkedAt } },
          { checkedAt: before.checkedAt, id: { lt: before.id } },
        ],
      },
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    });
  },
  // Stage 14.8: fetches ONE row more than the public cap so the oldest
  // VISIBLE row can still be correctly compared against its true previous
  // snapshot for change-tracking. That extra (101st) row is a comparison
  // baseline only — the service layer slices it off before returning
  // `checks` to the client, so the API never exposes more than
  // MAX_HISTORY_RECORDS rows. Stage P2: scoped by pageUrl too, so the
  // baseline/cap logic operates entirely within one page's own history --
  // a subpage with only one check of its own correctly sees isBaseline:
  // true, never falling back to the homepage's or another page's rows.
  findHistoryWithBaseline: (websiteId: string, pageUrl: string) => {
    return prisma.seoCheck.findMany({
      where: { websiteId, pageUrl },
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
      take: MAX_HISTORY_RECORDS + 1,
    });
  },
  count: (websiteId: string, pageUrl: string) => {
    return prisma.seoCheck.count({ where: { websiteId, pageUrl } });
  },
  // Stage 15.6: one short DB-only transaction per SeoCheck transition,
  // creating each Alert AND its recipient IN_APP Notification together --
  // deliberately still separate from `create` above (SeoCheck persistence),
  // so a failure here can never roll back an already-committed SeoCheck
  // row (Stage 15.2's existing invariant, unchanged). Individual creates in
  // a loop (not createMany) because each Notification needs its own
  // Alert's generated id, which createMany never returns. A genuine
  // duplicate (retry of the exact same transition) still relies on the
  // Stage 15.1 @@unique([seoCheckId, code, type]) constraint -- but since
  // deriveSeoAlerts is a pure function of one specific (previous, current)
  // check pair, a retry of the SAME transition always reproduces the exact
  // same alert set, so a duplicate here means EVERY alert in this batch
  // already exists, not a partial mix; the whole transaction failing
  // together on that retry is correct, not a new failure mode.
  createAlertsWithNotifications: (alerts: SeoAlertCreateInput[], userId: string) => {
    if (alerts.length === 0) return Promise.resolve([]);

    return prisma.$transaction(async (tx) => {
      const created = [];
      for (const alert of alerts) {
        const row = await tx.alert.create({ data: alert });
        await notificationRepository.createForAlert(tx, { alertId: row.id, userId });
        // Stage 17.3: same transaction, same (alertId, userId) pair --
        // IN_APP and EMAIL are independent sibling delivery decisions off
        // the same just-created Alert, never coupled to each other.
        await createEmailIntentForAlert(tx, { alertId: row.id, userId });
        created.push(row);
      }
      return created;
    });
  },
};
