import type { AlertSeverity, AlertType } from "../../generated/prisma/client";
import { EmailPayloadError } from "./payload-errors";

export interface EmailTemplateAlertInput {
  type: AlertType;
  severity: AlertSeverity;
  code: string | null;
  message: string | null;
  createdAt: Date;
}

export interface EmailTemplateWebsiteInput {
  name: string | null;
  url: string;
}

// Stage 17.4 §33: one normalized representation consumed by BOTH
// renderEmailHtml and renderEmailText (templates.ts) -- every dynamic
// VALUE lives here as plain, unescaped text; markup/formatting decisions
// live only in templates.ts, so HTML and plain-text can never drift
// semantically from one another.
export interface EmailEventContent {
  subjectLine: string;
  heading: string;
  summary: string;
  facts: string[];
  actionLabel: string;
}

// Stage 17.4 §16: the one deterministic display-name rule, shared by
// every template below -- Website.name when meaningful, otherwise the
// hostname parsed from the stored URL. Never a fabricated business name.
export function getWebsiteDisplayName(website: EmailTemplateWebsiteInput): string {
  if (website.name && website.name.trim().length > 0) {
    return website.name.trim();
  }
  try {
    return new URL(website.url).hostname;
  } catch {
    // Malformed stored URL (should not happen -- Website.url is validated
    // at creation time elsewhere) -- fail safe to the raw string rather
    // than throwing here; this is display text, not a link target.
    return website.url;
  }
}

// Stage 17.4 §31: a single deterministic format, locale and timezone both
// explicitly pinned (never the server's own machine locale/timezone) so
// the same Date always renders identically regardless of environment.
// Always derived from the ALERT's own persisted createdAt, never
// `new Date()`/"now" (Stage 17.4 §47's determinism requirement).
export function formatTimestampUtc(date: Date): string {
  const day = date.getUTCDate();
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}

// Stage 17.3's own Alert.code convention (performance/alerts.ts) --
// reused verbatim here, never redefined. Performance Alert rows already
// carry their strategy encoded in `code`, so no PerformanceCheck join is
// needed to display it (Stage 17.4 §14's own explicit "do not assume
// metrics are stored directly on Alert -- inspect actual schema" finding:
// strategy IS reliably available this way, raw CWV metric values are not).
const STRATEGY_LABEL_BY_CODE: Record<string, string> = {
  MOBILE_CORE_WEB_VITALS: "Mobile",
  DESKTOP_CORE_WEB_VITALS: "Desktop",
};

function strategyLabelFromCode(code: string | null): string | null {
  return code ? (STRATEGY_LABEL_BY_CODE[code] ?? null) : null;
}

// Stage 17.4 §6/§29: exhaustive over the six currently-approved AlertType
// values -- the `default` branch's `never` assignment makes it a
// TypeScript compile error to add a seventh AlertType without updating
// this function, and throws a sanitized EmailPayloadError if somehow
// reached at runtime anyway. No generic silent fallback template exists.
//
// Content principle (Stage 17.4 §7): every `summary` line states only
// what Sentinel AI's own deterministic engines already concluded (Alert.
// message, when persisted) -- never a root cause, never AI inference,
// never marketing language. INCIDENT_OPENED/INCIDENT_RESOLVED have no
// persisted `message` (monitor/repository.ts leaves it null -- uptime
// alerts have no domain-specific text to populate), so their summary is
// this stage's own minimal, hedged, fact-only sentence instead.
export function buildEmailEventContent(
  alert: EmailTemplateAlertInput,
  website: EmailTemplateWebsiteInput
): EmailEventContent {
  const displayName = getWebsiteDisplayName(website);
  const timestamp = formatTimestampUtc(alert.createdAt);
  const actionLabel = "View in Sentinel AI";

  switch (alert.type) {
    case "INCIDENT_OPENED":
      return {
        subjectLine: `[DOWN] ${displayName}`,
        heading: "Website entered the DOWN state",
        summary: "Sentinel AI detected that this website entered the DOWN state.",
        facts: [`Website: ${displayName}`, `Detected: ${timestamp}`],
        actionLabel,
      };

    case "INCIDENT_RESOLVED":
      return {
        subjectLine: `[RECOVERED] ${displayName}`,
        heading: "Website recovered",
        summary:
          "Sentinel AI detected that the website recovered from the previously opened incident.",
        facts: [`Website: ${displayName}`, `Recovered: ${timestamp}`],
        actionLabel,
      };

    case "SEO_ISSUE_OPENED": {
      const facts = [`Website: ${displayName}`, `Severity: ${alert.severity}`];
      if (alert.code) facts.push(`Issue code: ${alert.code}`);
      facts.push(`Detected: ${timestamp}`);
      return {
        subjectLine: `[SEO] Issue detected on ${displayName}`,
        heading: "SEO issue detected",
        summary: alert.message ?? "Sentinel AI detected a new SEO issue on this website.",
        facts,
        actionLabel,
      };
    }

    case "SEO_ISSUE_RESOLVED": {
      const facts = [`Website: ${displayName}`, `Severity: ${alert.severity}`];
      if (alert.code) facts.push(`Issue code: ${alert.code}`);
      facts.push(`Resolved: ${timestamp}`);
      return {
        subjectLine: `[SEO] Issue resolved on ${displayName}`,
        heading: "SEO issue resolved",
        summary:
          alert.message ??
          "Sentinel AI detected that a previously-flagged SEO issue is no longer present in the latest check.",
        facts,
        actionLabel,
      };
    }

    case "PERFORMANCE_DEGRADED": {
      const strategyLabel = strategyLabelFromCode(alert.code);
      const facts = [`Website: ${displayName}`];
      if (strategyLabel) facts.push(`Strategy: ${strategyLabel}`);
      facts.push(`Detected: ${timestamp}`);
      return {
        subjectLine: `[PERFORMANCE] Degraded on ${displayName}`,
        heading: "Performance degraded",
        summary: alert.message ?? "Sentinel AI detected a performance degradation on this website.",
        facts,
        actionLabel,
      };
    }

    case "PERFORMANCE_RECOVERED": {
      const strategyLabel = strategyLabelFromCode(alert.code);
      const facts = [`Website: ${displayName}`];
      if (strategyLabel) facts.push(`Strategy: ${strategyLabel}`);
      facts.push(`Recovered: ${timestamp}`);
      return {
        subjectLine: `[PERFORMANCE] Recovered on ${displayName}`,
        heading: "Performance recovered",
        summary:
          alert.message ??
          "Sentinel AI detected that the monitored page recovered from its previous degraded performance state.",
        facts,
        actionLabel,
      };
    }

    default: {
      const exhaustiveCheck: never = alert.type;
      throw new EmailPayloadError(
        "UNSUPPORTED_ALERT_TYPE",
        `Unsupported AlertType for email content: ${String(exhaustiveCheck)}`
      );
    }
  }
}
