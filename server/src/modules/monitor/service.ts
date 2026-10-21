import { monitorRepository } from "./repository";
import { websiteRepository } from "../website/repository";
import { AlertFilters, CheckResult, HistoryRange, IncidentStatus } from "./types";
import { NotFoundError } from "../../errors/AppError";
import { deriveMonitoringStatus } from "./status";

// Stage 18.5: exported (value unchanged) so the uptime AI input reports the
// exact timeout the checks actually use, rather than a copy that could drift.
export const REQUEST_TIMEOUT_MS = 10_000;

const RANGE_MS: Record<HistoryRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

async function verifyOwnership(websiteId: string, userId: string) {
  const website = await websiteRepository.findById(websiteId, userId);

  if (!website) {
    throw new NotFoundError(`Website with id '${websiteId}' not found.`);
  }

  return website;
}

export const monitorService = {
  getActiveWebsites: () => {
    return monitorRepository.findActiveWebsites();
  },
  checkWebsite: async (websiteId: string, url: string): Promise<CheckResult> => {
    const startedAt = Date.now();

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

      return {
        websiteId,
        success: true,
        statusCode: response.status,
        responseTimeMs: Date.now() - startedAt,
      };
    } catch {
      return {
        websiteId,
        success: false,
        statusCode: null,
        responseTimeMs: Date.now() - startedAt,
      };
    }
  },
  saveCheckResult: (result: CheckResult) => {
    return monitorRepository.saveCheckResult(result);
  },
  getHistory: async (websiteId: string, userId: string, range: HistoryRange) => {
    const website = await verifyOwnership(websiteId, userId);
    const since = new Date(Date.now() - RANGE_MS[range]);

    const [checks, stats, latestCheck] = await Promise.all([
      monitorRepository.findHistory(websiteId, since),
      monitorRepository.getHistoryStats(websiteId, since),
      monitorRepository.findLatest(websiteId),
    ]);

    // Status reflects the website's current state (latest check + current
    // consecutiveFailures), not the range-filtered `checks` — a website's
    // live status shouldn't depend on which history range happens to be
    // selected in the UI.
    const status = deriveMonitoringStatus({
      latestCheck,
      consecutiveFailures: website.consecutiveFailures,
    });

    return { checks, stats, status };
  },
  getLatest: async (websiteId: string, userId: string) => {
    const website = await verifyOwnership(websiteId, userId);
    const check = await monitorRepository.findLatest(websiteId);

    const status = deriveMonitoringStatus({
      latestCheck: check,
      consecutiveFailures: website.consecutiveFailures,
    });

    return { check, status };
  },
  runManualCheck: async (websiteId: string, userId: string) => {
    const website = await verifyOwnership(websiteId, userId);
    const result = await monitorService.checkWebsite(website.id, website.url);
    return monitorService.saveCheckResult(result);
  },
  getIncidents: async (websiteId: string, userId: string, status?: IncidentStatus) => {
    await verifyOwnership(websiteId, userId);
    return monitorRepository.findIncidentsByWebsiteId(websiteId, status);
  },
  // Stage 15.4: unified read across all three Alert sources. Count and data
  // queries share the exact same filters (both delegate to
  // buildAlertWhere internally), so `truncated` is always computed from a
  // consistent pair rather than two independently-filtered results.
  getAlerts: async (websiteId: string, userId: string, filters: AlertFilters) => {
    await verifyOwnership(websiteId, userId);

    const [alerts, total] = await Promise.all([
      monitorRepository.findAlertsByWebsiteId(websiteId, filters),
      monitorRepository.countAlertsByWebsiteId(websiteId, filters),
    ]);

    return { alerts, total, truncated: total > alerts.length };
  },
};
