import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AlertFilters, CheckResult, HistoryStats, IncidentStatus } from "./types";
import { decideIncidentAction } from "./incidents";
import { decideAlertAction } from "./alerts";
import { FAILURE_CONFIRMATION_THRESHOLD } from "./status";
import { notificationRepository } from "../notification/repository";
import { createEmailIntentForAlert } from "../email-delivery/service";

const MAX_HISTORY_RECORDS = 500;

// Stage 15.4: V1 bounded history for the unified Alert read API. Follows
// the exact same "fixed latest N, not cursor pagination" precedent already
// established for SeoCheck/PerformanceCheck/MonitoringCheck history.
const MAX_ALERT_RECORDS = 100;

// Single source of truth for the unified-Alert `where` clause, used by
// BOTH findAlertsByWebsiteId and countAlertsByWebsiteId below — the data
// query and the count query must always see identical filters, so the
// clause is built here once rather than duplicated in each method (Stage
// 15.4 §19).
function buildAlertWhere(websiteId: string, filters: AlertFilters) {
  return {
    websiteId,
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  };
}

export const monitorRepository = {
  findActiveWebsites: () => {
    return prisma.website.findMany({ where: { isActive: true } });
  },
  saveCheckResult: async (result: CheckResult) => {
    return prisma.$transaction(async (tx) => {
      const check = await tx.monitoringCheck.create({ data: result });

      // Stage 15.6: widened to also select userId -- the authoritative
      // recipient for this website's Notifications, resolved from the DB
      // row already being fetched here rather than a new query.
      const website = await tx.website.update({
        where: { id: result.websiteId },
        data: result.success
          ? { consecutiveFailures: 0 }
          : { consecutiveFailures: { increment: 1 } },
        select: { consecutiveFailures: true, userId: true },
      });

      const openIncident = await tx.incident.findFirst({
        where: { websiteId: result.websiteId, status: "OPEN" },
      });

      // Only look up the streak's start when we might actually create an
      // incident — the general case (already UP, or an unconfirmed
      // failure) never needs this extra query.
      let streakStartedAt: Date | null = null;
      if (
        !result.success &&
        !openIncident &&
        website.consecutiveFailures >= FAILURE_CONFIRMATION_THRESHOLD
      ) {
        const recentFailures = await tx.monitoringCheck.findMany({
          where: { websiteId: result.websiteId },
          orderBy: { checkedAt: "desc" },
          take: website.consecutiveFailures,
        });
        streakStartedAt =
          recentFailures[recentFailures.length - 1]?.checkedAt ?? null;
      }

      const action = decideIncidentAction({
        success: result.success,
        consecutiveFailures: website.consecutiveFailures,
        hasOpenIncident: Boolean(openIncident),
        streakStartedAt,
        checkedAt: check.checkedAt,
      });

      let incidentId: string | null = null;

      if (action.type === "create") {
        const incident = await tx.incident.create({
          data: {
            websiteId: result.websiteId,
            status: "OPEN",
            startedAt: action.startedAt,
          },
        });
        incidentId = incident.id;
      } else if (action.type === "resolve" && openIncident) {
        const incident = await tx.incident.update({
          where: { id: openIncident.id },
          data: { status: "RESOLVED", resolvedAt: action.resolvedAt },
        });
        incidentId = incident.id;
      }

      // Alerts are derived 1:1 from the same Incident action already
      // decided above — never from `result.success`/`website.consecutiveFailures`
      // independently — so this can only ever fire alongside a real
      // create/resolve, never as its own separate decision.
      const alertAction = decideAlertAction(action);

      if (alertAction.type === "create" && incidentId) {
        // Stage 15.1: the generic Alert model now requires `source`/
        // `severity` on every row. Uptime alerts are always source=UPTIME;
        // severity is the approved deterministic mapping from the alert
        // type decideAlertAction already produced (never re-derived from
        // raw check/status data) — alertAction.alertType's own local type
        // (monitor/alerts.ts) can only ever be INCIDENT_OPENED or
        // INCIDENT_RESOLVED, so this ternary can never see a SEO/Performance
        // value. code/message/seoCheckId/performanceCheckId are left
        // unset (null) — no historical text is manufactured, and uptime
        // alerts have no equivalent domain-specific identity to populate.
        const alert = await tx.alert.create({
          data: {
            incidentId,
            websiteId: result.websiteId,
            type: alertAction.alertType,
            source: "UPTIME",
            severity: alertAction.alertType === "INCIDENT_OPENED" ? "ERROR" : "INFO",
          },
        });

        // Stage 15.6: inside the SAME transaction as the Alert insert above
        // -- Alert and its IN_APP Notification succeed or fail together,
        // preserving the existing MonitoringCheck+Incident+Alert atomicity
        // this transaction already guaranteed, now extended by one more
        // write rather than a separate follow-up step.
        await notificationRepository.createForAlert(tx, { alertId: alert.id, userId: website.userId });
        // Stage 17.3: same transaction, same (alertId, userId) pair --
        // IN_APP and EMAIL are independent sibling delivery decisions off
        // the same just-created Alert, never coupled to each other.
        await createEmailIntentForAlert(tx, { alertId: alert.id, userId: website.userId });
      }

      return check;
    });
  },
  findHistory: (websiteId: string, since: Date) => {
    return prisma.monitoringCheck.findMany({
      where: { websiteId, checkedAt: { gte: since } },
      orderBy: { checkedAt: "desc" },
      take: MAX_HISTORY_RECORDS,
    });
  },
  getHistoryStats: async (websiteId: string, since: Date): Promise<HistoryStats> => {
    const where = { websiteId, checkedAt: { gte: since } };

    const [total, successful, aggregate] = await Promise.all([
      prisma.monitoringCheck.count({ where }),
      prisma.monitoringCheck.count({ where: { ...where, success: true } }),
      prisma.monitoringCheck.aggregate({ where, _avg: { responseTimeMs: true } }),
    ]);

    return {
      total,
      successful,
      failed: total - successful,
      uptimePercentage:
        total > 0 ? Math.round((successful / total) * 10000) / 100 : null,
      averageResponseTimeMs:
        total > 0 && aggregate._avg.responseTimeMs !== null
          ? Math.round(aggregate._avg.responseTimeMs)
          : null,
    };
  },
  findLatest: (websiteId: string) => {
    return prisma.monitoringCheck.findFirst({
      where: { websiteId },
      orderBy: { checkedAt: "desc" },
    });
  },
  findIncidentsByWebsiteId: (websiteId: string, status?: IncidentStatus) => {
    return prisma.incident.findMany({
      where: { websiteId, ...(status ? { status } : {}) },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    });
  },

  // --- Stage 18.5: read-only, additive -- used only by the uptime AI ----
  //
  // None of these change monitoring behavior. Incidents are not linked to
  // MonitoringCheck rows, so an incident's checks are found BY TIME within
  // the same website. Every query is bounded (aggregates computed in SQL,
  // fixed-size samples). Note: monitoring_checks has no (websiteId,
  // checkedAt) index yet, so these scan the table -- acceptable for a
  // manual action; a dedicated index is a separate, later migration.
  // Negative responseTimeMs values (rare wall-clock jumps) are excluded from
  // every timing figure -- they are unknown, not fast.

  // "The one exact row the caller already has an id for", intentionally
  // unscoped; the caller MUST cross-check websiteId against an ownership-
  // verified website before using it.
  findIncidentById: (id: string) => {
    return prisma.incident.findUnique({ where: { id } });
  },

  // Failure/timing aggregates for checks in [from, to). `timeoutCeilingMs`
  // splits failures into "hit the request timeout" vs "failed quickly".
  getIncidentWindowStats: async (websiteId: string, from: Date, to: Date, timeoutCeilingMs: number) => {
    const rows = await prisma.$queryRaw<
      {
        total: number;
        failed: number;
        timeouts: number;
        fast: number;
        min_rt: number | null;
        median_rt: number | null;
        max_rt: number | null;
        last_at: Date | null;
      }[]
    >(Prisma.sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE NOT success)::int AS failed,
        count(*) FILTER (WHERE NOT success AND "responseTimeMs" >= ${timeoutCeilingMs})::int AS timeouts,
        count(*) FILTER (WHERE NOT success AND "responseTimeMs" >= 0 AND "responseTimeMs" < ${timeoutCeilingMs})::int AS fast,
        min("responseTimeMs") FILTER (WHERE NOT success AND "responseTimeMs" >= 0)::int AS min_rt,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY "responseTimeMs") FILTER (WHERE NOT success AND "responseTimeMs" >= 0))::int AS median_rt,
        max("responseTimeMs") FILTER (WHERE NOT success AND "responseTimeMs" >= 0)::int AS max_rt,
        max("checkedAt") AS last_at
      FROM monitoring_checks
      WHERE "websiteId" = ${websiteId} AND "checkedAt" >= ${from} AND "checkedAt" < ${to}
    `);
    return rows[0];
  },

  // A fixed-size sample from one end of [from, to): the first N (asc) or
  // last N (desc) checks.
  findIncidentWindowSample: (websiteId: string, from: Date, to: Date, take: number, order: "asc" | "desc") => {
    return prisma.monitoringCheck.findMany({
      where: { websiteId, checkedAt: { gte: from, lt: to } },
      orderBy: [{ checkedAt: order }, { id: order }],
      take,
      select: { id: true, checkedAt: true, success: true, statusCode: true, responseTimeMs: true },
    });
  },

  // The normal state before the incident: success rate, median successful
  // response time, and slow successful checks in [from, to).
  getBaselineStats: async (websiteId: string, from: Date, to: Date, slowThresholdMs: number) => {
    const rows = await prisma.$queryRaw<
      { total: number; successful: number; median_rt: number | null; slow: number }[]
    >(Prisma.sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE success)::int AS successful,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY "responseTimeMs") FILTER (WHERE success AND "responseTimeMs" >= 0))::int AS median_rt,
        count(*) FILTER (WHERE success AND "responseTimeMs" > ${slowThresholdMs})::int AS slow
      FROM monitoring_checks
      WHERE "websiteId" = ${websiteId} AND "checkedAt" >= ${from} AND "checkedAt" < ${to}
    `);
    return rows[0];
  },

  findLastSuccessBefore: (websiteId: string, before: Date) => {
    return prisma.monitoringCheck.findFirst({
      where: { websiteId, success: true, checkedAt: { lt: before } },
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
      select: { checkedAt: true, statusCode: true, responseTimeMs: true },
    });
  },

  findFirstSuccessAtOrAfter: (websiteId: string, at: Date) => {
    return prisma.monitoringCheck.findFirst({
      where: { websiteId, success: true, checkedAt: { gte: at } },
      orderBy: [{ checkedAt: "asc" }, { id: "asc" }],
      select: { checkedAt: true, statusCode: true, responseTimeMs: true },
    });
  },

  countOtherIncidentsSince: (websiteId: string, since: Date, excludeIncidentId: string) => {
    return prisma.incident.count({
      where: { websiteId, startedAt: { gte: since }, id: { not: excludeIncidentId } },
    });
  },
  // Stage 15.4: the temporary source=UPTIME restriction Stage 15.2 added
  // (to keep this endpoint uptime-only while SEO/Performance generation was
  // still being built) is now removed — this is the intentional unified
  // read API. Filters are optional and combine with AND semantics via the
  // shared buildAlertWhere clause above. Explicit `select` (never
  // `include`) guarantees no related Incident/SeoCheck/PerformanceCheck/
  // Website/User object can ever leak into the response, regardless of
  // future relation additions to the Alert model.
  findAlertsByWebsiteId: (websiteId: string, filters: AlertFilters) => {
    return prisma.alert.findMany({
      where: buildAlertWhere(websiteId, filters),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_ALERT_RECORDS,
      select: {
        id: true,
        websiteId: true,
        source: true,
        type: true,
        severity: true,
        code: true,
        message: true,
        incidentId: true,
        seoCheckId: true,
        performanceCheckId: true,
        createdAt: true,
      },
    });
  },
  countAlertsByWebsiteId: (websiteId: string, filters: AlertFilters) => {
    return prisma.alert.count({ where: buildAlertWhere(websiteId, filters) });
  },
};
