import type { SeoChangeValue, SeoIndexability, SeoIssueSeverity } from "./types";

type BadgeStatus = "healthy" | "warning" | "critical" | "inactive";

export const SEVERITY_BADGE_STATUS: Record<SeoIssueSeverity, BadgeStatus> = {
  ERROR: "critical",
  WARNING: "warning",
  INFO: "inactive",
};

export const SEVERITY_LABEL: Record<SeoIssueSeverity, string> = {
  ERROR: "Error",
  WARNING: "Warning",
  INFO: "Info",
};

export const INDEXABILITY_BADGE_STATUS: Record<SeoIndexability, BadgeStatus> = {
  INDEXABLE: "healthy",
  NOT_INDEXABLE: "critical",
  UNKNOWN: "inactive",
};

export const INDEXABILITY_LABEL: Record<SeoIndexability, string> = {
  INDEXABLE: "Indexable",
  NOT_INDEXABLE: "Not indexable",
  UNKNOWN: "Unknown",
};

// Distinct wording from the discovery helpers below on purpose: this is for
// an HTML tag that was simply absent from the page (title/meta/canonical/
// H1 text), a different concept from "we tried to fetch a file over the
// network and it wasn't there".
export function formatOrNotSet(value: string | null): string {
  return value ?? "Not set";
}

// Renders the Stage 14.3A three-state discovery contract — true/false/null
// map to three genuinely different, clearly distinguishable labels. null
// must never render the same as false.
export function formatDiscoveryStatus(found: boolean | null): string {
  if (found === true) return "Found";
  if (found === false) return "Not found";
  return "Could not verify";
}

export function discoveryBadgeStatus(found: boolean | null): BadgeStatus {
  if (found === true) return "healthy";
  if (found === false) return "warning";
  return "inactive";
}

export function formatFullTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

// Both INDEXABILITY_CHANGED and the discovery status changes can produce
// the SAME raw string "UNKNOWN" but mean different things (an indexability
// state vs. "could not verify a file exists") — so the label lookup below
// is keyed by the change `code`, not the raw value alone, to avoid
// conflating the two.
const INDEXABILITY_CHANGE_CODES = new Set(["INDEXABILITY_CHANGED"]);
const DISCOVERY_STATUS_CHANGE_CODES = new Set([
  "ROBOTS_TXT_STATUS_CHANGED",
  "SITEMAP_STATUS_CHANGED",
]);
const DISCOVERY_STATUS_LABEL: Record<string, string> = {
  FOUND: "Found",
  NOT_FOUND: "Not found",
  UNKNOWN: "Could not verify",
};

// Formats a single before/after value for display. `null` reads as "—"
// (never blank, never "0"); known enum strings get their human label based
// on which change code produced them; everything else (status codes,
// counts, free text like titles) is shown as-is.
export function formatChangeValue(code: string, value: SeoChangeValue): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (INDEXABILITY_CHANGE_CODES.has(code) && value in INDEXABILITY_LABEL) {
      return INDEXABILITY_LABEL[value as SeoIndexability];
    }
    if (DISCOVERY_STATUS_CHANGE_CODES.has(code) && value in DISCOVERY_STATUS_LABEL) {
      return DISCOVERY_STATUS_LABEL[value];
    }
  }
  return String(value);
}
