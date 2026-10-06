import { AlertFilters, AlertSeverity, AlertSource, AlertType, HistoryRange, IncidentStatus } from "./types";

const VALID_RANGES: HistoryRange[] = ["24h", "7d", "30d"];
const VALID_INCIDENT_STATUSES: IncidentStatus[] = ["OPEN", "RESOLVED"];
// Stage 15.4: generalized from the original 2-value uptime-only list to all
// current AlertType values. Strict-case, exact-match only — matches this
// file's own existing convention (no enum here has ever normalized casing;
// an unrecognized/miscased value is always rejected with 400, never
// silently coerced or ignored).
const VALID_ALERT_TYPES: AlertType[] = [
  "INCIDENT_OPENED",
  "INCIDENT_RESOLVED",
  "SEO_ISSUE_OPENED",
  "SEO_ISSUE_RESOLVED",
  "PERFORMANCE_DEGRADED",
  "PERFORMANCE_RECOVERED",
];
const VALID_ALERT_SOURCES: AlertSource[] = ["UPTIME", "SEO", "PERFORMANCE"];
const VALID_ALERT_SEVERITIES: AlertSeverity[] = ["INFO", "WARNING", "ERROR"];

type ValidationResult =
  | { valid: true; range: HistoryRange }
  | { valid: false; error: string };

type IncidentStatusValidationResult =
  | { valid: true; status: IncidentStatus | undefined }
  | { valid: false; error: string };

type AlertFiltersValidationResult =
  | { valid: true; filters: AlertFilters }
  | { valid: false; error: string };

export const monitorValidation = {
  validateHistoryRange: (query: unknown): ValidationResult => {
    const raw = (query as Record<string, unknown> | undefined)?.range;

    if (raw === undefined) {
      return { valid: true, range: "24h" };
    }

    if (typeof raw !== "string" || !VALID_RANGES.includes(raw as HistoryRange)) {
      return {
        valid: false,
        error: `'range' must be one of: ${VALID_RANGES.join(", ")}.`,
      };
    }

    return { valid: true, range: raw as HistoryRange };
  },
  validateIncidentStatus: (query: unknown): IncidentStatusValidationResult => {
    const raw = (query as Record<string, unknown> | undefined)?.status;

    if (raw === undefined) {
      return { valid: true, status: undefined };
    }

    if (typeof raw !== "string" || !VALID_INCIDENT_STATUSES.includes(raw as IncidentStatus)) {
      return {
        valid: false,
        error: `'status' must be one of: ${VALID_INCIDENT_STATUSES.join(", ")}.`,
      };
    }

    return { valid: true, status: raw as IncidentStatus };
  },
  // Stage 15.4: validates all three unified-Alert query filters together
  // (they're always used together for the one endpoint) and returns a
  // single combined AlertFilters object. Each filter is independently
  // optional; any filter that IS provided must be an exact, valid,
  // uppercase enum value or the whole request is rejected with 400 --
  // never silently ignored, never coerced.
  validateAlertFilters: (query: unknown): AlertFiltersValidationResult => {
    const q = query as Record<string, unknown> | undefined;
    const rawSource = q?.source;
    const rawSeverity = q?.severity;
    const rawType = q?.type;

    if (rawSource !== undefined && (typeof rawSource !== "string" || !VALID_ALERT_SOURCES.includes(rawSource as AlertSource))) {
      return { valid: false, error: `'source' must be one of: ${VALID_ALERT_SOURCES.join(", ")}.` };
    }
    if (rawSeverity !== undefined && (typeof rawSeverity !== "string" || !VALID_ALERT_SEVERITIES.includes(rawSeverity as AlertSeverity))) {
      return { valid: false, error: `'severity' must be one of: ${VALID_ALERT_SEVERITIES.join(", ")}.` };
    }
    if (rawType !== undefined && (typeof rawType !== "string" || !VALID_ALERT_TYPES.includes(rawType as AlertType))) {
      return { valid: false, error: `'type' must be one of: ${VALID_ALERT_TYPES.join(", ")}.` };
    }

    return {
      valid: true,
      filters: {
        source: rawSource as AlertSource | undefined,
        severity: rawSeverity as AlertSeverity | undefined,
        type: rawType as AlertType | undefined,
      },
    };
  },
};
