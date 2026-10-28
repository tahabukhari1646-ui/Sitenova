import { monitorRepository } from "./repository";
import { websiteRepository } from "../website/repository";
import { AlertFilters, CheckResult, HistoryRange, IncidentStatus } from "./types";
import { NotFoundError } from "../../errors/AppError";
import { deriveMonitoringStatus } from "./status";
import { safeFetch, SafeFetchError, type SafeFetchErrorCode } from "../../utils/safeFetch";

// Stage 18.5: exported (value unchanged) so the uptime AI input reports the
// exact timeout the checks actually use, rather than a copy that could drift.
export const REQUEST_TIMEOUT_MS = 10_000;

// safeFetch refusals that mean "this address must never be contacted",
// as opposed to an ordinary outage (timeout, DNS failure, network error).
const REFUSED_DESTINATION_CODES = new Set<SafeFetchErrorCode>([
  "BLOCKED_DESTINATION",
  "INVALID_URL",
  "UNSUPPORTED_PROTOCOL",
  "CREDENTIALS_NOT_ALLOWED",
]);

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
  // Stage 20.1: goes through safeFetch (SSRF protection) instead of a raw
  // fetch() -- private/internal destinations, non-http(s) URLs and URLs with
  // credentials are refused before any connection, every redirect is
  // re-checked, and the resolved address is validated at connect time.
  // Headers only (discardBody); "any HTTP answer counts as up" is unchanged.
  checkWebsite: async (websiteId: string, url: string): Promise<CheckResult> => {
    const startedAt = Date.now();

    try {
      const response = await safeFetch(url, { timeoutMs: REQUEST_TIMEOUT_MS, discardBody: true });

      return {
        websiteId,
        success: true,
        statusCode: response.statusCode,
        responseTimeMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof SafeFetchError && REFUSED_DESTINATION_CODES.has(error.code)) {
        // Recorded as a failed check like any unreachable site, but logged
        // so a refused address is visible. Code only -- never the URL.
        console.warn(`Uptime check refused for website ${websiteId}: ${error.code}`);
      }
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
