import { prisma } from "../../config/prisma";
import type { NotificationStatusFilter } from "./types";

// V1 bounded history, matching every other "fixed latest N" history
// convention already established in this codebase (SeoCheck/
// PerformanceCheck/MonitoringCheck/Alert history) — no cursor pagination.
export const MAX_NOTIFICATION_RECORDS = 100;

function buildStatusWhere(userId: string, status: NotificationStatusFilter) {
  return {
    userId,
    // Explicit even though IN_APP is the only channel that exists today —
    // so a future EMAIL/SLACK channel can never silently start appearing
    // in this in-app-only inbox query (Stage 15.6 §23).
    channel: "IN_APP" as const,
    ...(status === "UNREAD" ? { readAt: null } : {}),
    ...(status === "READ" ? { readAt: { not: null } } : {}),
  };
}

// Explicit select only — never `include` — so no Incident/SeoCheck/
// PerformanceCheck/User relation can ever leak through, and Website is
// narrowed to exactly the 3 safe display fields decided in Stage 15.6 §17.
const NOTIFICATION_SELECT = {
  id: true,
  channel: true,
  readAt: true,
  createdAt: true,
  alert: {
    select: {
      id: true,
      websiteId: true,
      source: true,
      type: true,
      severity: true,
      code: true,
      message: true,
      createdAt: true,
      website: { select: { id: true, name: true, url: true } },
    },
  },
} as const;

export const notificationRepository = {
  // Shared low-level primitive: creates exactly one IN_APP Notification for
  // one just-created Alert. Takes a Prisma client/transaction handle rather
  // than owning a transaction itself, so uptime/SEO/Performance can each
  // include this call inside their OWN existing atomic boundary — this
  // module deliberately does not decide where that boundary is (Stage 15.6
  // §13: a shared repository-level primitive, not a shared service-level
  // engine across three different domains).
  //
  // Stage 16.8 §15/§16: this is also the ONE place in-app delivery
  // preference is enforced — Uptime/SEO/Performance are completely
  // unaware of User.inAppNotificationsEnabled and need no change, since all
  // three already call through this single function. The Alert row itself
  // is always created by the caller BEFORE this runs (see
  // performance/repository.ts's createAlertWithNotification and its
  // SEO/Uptime equivalents) — a disabled preference only ever skips the
  // Notification, never the Alert, preserving Alerts as durable domain
  // events independent of delivery preference (Stage 16.8 §16). Returns
  // null (not an error) when skipped; every call site already discards
  // this method's return value.
  createForAlert: async (
    client: Pick<typeof prisma, "notification" | "user">,
    input: { alertId: string; userId: string }
  ) => {
    const recipient = await client.user.findUnique({
      where: { id: input.userId },
      select: { inAppNotificationsEnabled: true },
    });

    // Fails OPEN (creates the Notification) if the user row is somehow
    // missing — input.userId always comes from an already-loaded
    // website.userId/incident owner at the caller, so this is a defensive
    // fallback, not an expected path; never silently drop a delivery
    // record over an unexpected edge case.
    if (recipient && !recipient.inAppNotificationsEnabled) {
      return null;
    }

    return client.notification.create({
      data: { alertId: input.alertId, userId: input.userId, channel: "IN_APP" },
    });
  },
  findByUserId: (userId: string, status: NotificationStatusFilter) => {
    return prisma.notification.findMany({
      where: buildStatusWhere(userId, status),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_NOTIFICATION_RECORDS,
      select: NOTIFICATION_SELECT,
    });
  },
  // Same buildStatusWhere as findByUserId (Stage 15.6 §19's count/data
  // filter-consistency requirement, exactly like Stage 15.4's
  // buildAlertWhere).
  countByUserId: (userId: string, status: NotificationStatusFilter) => {
    return prisma.notification.count({ where: buildStatusWhere(userId, status) });
  },
  // Deliberately ignores `status` — always the true global unread count
  // (Stage 15.6 §20).
  countUnreadByUserId: (userId: string) => {
    return prisma.notification.count({ where: { userId, channel: "IN_APP", readAt: null } });
  },
  findOwnedById: (id: string, userId: string) => {
    return prisma.notification.findFirst({ where: { id, userId, channel: "IN_APP" } });
  },
  markRead: (id: string) => {
    return prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: { id: true, readAt: true },
    });
  },
  // One updateMany, not a read-then-loop-update — already-read rows are
  // excluded by the `readAt: null` filter itself, so their original readAt
  // is never touched (Stage 15.6 §22).
  markAllRead: (userId: string) => {
    return prisma.notification.updateMany({
      where: { userId, channel: "IN_APP", readAt: null },
      data: { readAt: new Date() },
    });
  },
};
