import type { PerformanceHistoryRange, PerformanceStrategy } from "./types";

const VALID_STRATEGIES: PerformanceStrategy[] = ["MOBILE", "DESKTOP"];
const VALID_HISTORY_RANGES: PerformanceHistoryRange[] = ["24h", "7d", "30d"];
const DEFAULT_HISTORY_RANGE: PerformanceHistoryRange = "7d";

type RequiredStrategyValidationResult =
  | { valid: true; strategy: PerformanceStrategy; pageUrl: string | undefined }
  | { valid: false; error: string };

type OptionalStrategyValidationResult =
  | { valid: true; strategy: PerformanceStrategy | undefined; pageUrl: string | undefined }
  | { valid: false; error: string };

type HistoryQueryValidationResult =
  | { valid: true; strategy: PerformanceStrategy; range: PerformanceHistoryRange; pageUrl: string | undefined }
  | { valid: false; error: string };

// Stage P1: shared "is this a non-empty string if present" shape check for
// the optional `url`/pageUrl input, used identically by every endpoint
// below. Deliberately does NOT parse/normalize/validate the URL itself —
// that remains pageUrl.ts's job (resolvePageUrl), invoked by the service
// layer, matching this codebase's existing "validation.ts checks shape,
// service.ts enforces domain rules" layering.
function extractPageUrl(source: Record<string, unknown> | undefined): { valid: true; pageUrl: string | undefined } | { valid: false; error: string } {
  const raw = source?.url;
  if (raw === undefined) return { valid: true, pageUrl: undefined };
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { valid: false, error: "'url' must be a non-empty string if provided." };
  }
  return { valid: true, pageUrl: raw };
}

export const performanceValidation = {
  // POST /:id/performance/check — strategy is required in the body.
  validateStrategyBody: (body: unknown): RequiredStrategyValidationResult => {
    const params = body as Record<string, unknown> | undefined;
    const raw = params?.strategy;

    if (typeof raw !== "string" || !VALID_STRATEGIES.includes(raw as PerformanceStrategy)) {
      return {
        valid: false,
        error: `'strategy' is required and must be one of: ${VALID_STRATEGIES.join(", ")}.`,
      };
    }

    const pageUrlResult = extractPageUrl(params);
    if (!pageUrlResult.valid) return pageUrlResult;

    return { valid: true, strategy: raw as PerformanceStrategy, pageUrl: pageUrlResult.pageUrl };
  },
  // GET /:id/performance/latest and GET /:id/performance — strategy is an
  // optional query filter, matching the existing validateIncidentStatus/
  // validateAlertType pattern exactly.
  validateStrategyQuery: (query: unknown): OptionalStrategyValidationResult => {
    const params = query as Record<string, unknown> | undefined;
    const raw = params?.strategy;

    const pageUrlResult = extractPageUrl(params);
    if (!pageUrlResult.valid) return pageUrlResult;

    if (raw === undefined) {
      return { valid: true, strategy: undefined, pageUrl: pageUrlResult.pageUrl };
    }

    if (typeof raw !== "string" || !VALID_STRATEGIES.includes(raw as PerformanceStrategy)) {
      return {
        valid: false,
        error: `'strategy' must be one of: ${VALID_STRATEGIES.join(", ")}.`,
      };
    }

    return { valid: true, strategy: raw as PerformanceStrategy, pageUrl: pageUrlResult.pageUrl };
  },
  // GET /:id/performance/stats — strategy is required (never averages across
  // both strategies), so this reuses the same "required" result type as the
  // POST body validator above.
  validateRequiredStrategyQuery: (query: unknown): RequiredStrategyValidationResult => {
    const params = query as Record<string, unknown> | undefined;
    const raw = params?.strategy;

    if (typeof raw !== "string" || !VALID_STRATEGIES.includes(raw as PerformanceStrategy)) {
      return {
        valid: false,
        error: `'strategy' is required and must be one of: ${VALID_STRATEGIES.join(", ")}.`,
      };
    }

    const pageUrlResult = extractPageUrl(params);
    if (!pageUrlResult.valid) return pageUrlResult;

    return { valid: true, strategy: raw as PerformanceStrategy, pageUrl: pageUrlResult.pageUrl };
  },
  // GET /:id/performance (history/charts) — strategy is required (never
  // mixes MOBILE/DESKTOP into one chart); range is optional and defaults to
  // 7d, matching the frontend's default range selection.
  validateHistoryQuery: (query: unknown): HistoryQueryValidationResult => {
    const params = query as Record<string, unknown> | undefined;
    const rawStrategy = params?.strategy;
    const rawRange = params?.range;

    if (
      typeof rawStrategy !== "string" ||
      !VALID_STRATEGIES.includes(rawStrategy as PerformanceStrategy)
    ) {
      return {
        valid: false,
        error: `'strategy' is required and must be one of: ${VALID_STRATEGIES.join(", ")}.`,
      };
    }

    const pageUrlResult = extractPageUrl(params);
    if (!pageUrlResult.valid) return pageUrlResult;

    if (rawRange === undefined) {
      return {
        valid: true,
        strategy: rawStrategy as PerformanceStrategy,
        range: DEFAULT_HISTORY_RANGE,
        pageUrl: pageUrlResult.pageUrl,
      };
    }

    if (
      typeof rawRange !== "string" ||
      !VALID_HISTORY_RANGES.includes(rawRange as PerformanceHistoryRange)
    ) {
      return {
        valid: false,
        error: `'range' must be one of: ${VALID_HISTORY_RANGES.join(", ")}.`,
      };
    }

    return {
      valid: true,
      strategy: rawStrategy as PerformanceStrategy,
      range: rawRange as PerformanceHistoryRange,
      pageUrl: pageUrlResult.pageUrl,
    };
  },
};
