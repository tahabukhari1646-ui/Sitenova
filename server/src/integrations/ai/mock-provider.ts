import type {
  PerformanceAiInput,
  PerformanceAiOutput,
  PerformanceAiFinding,
  AiUrgency,
  DiagnosisAiFinding,
  DiagnosisAiOutput,
  IncidentAiInput,
  SeoAiInput,
} from "../../modules/ai-analysis/types";
import type { PerformanceRating } from "../../modules/performance/ratings";
import type { AiProvider } from "./provider";

// Stage 16.3: a deterministic, zero-network AiProvider implementation so
// the full manual-analysis flow can be developed and tested without an
// OpenAI API key. Implements the EXACT SAME AiProvider interface as
// OpenAiProvider -- the service layer cannot tell them apart.
//
// Pure function of its input only: no Date.now(), no Math.random(), no
// network, no environment reads. The same PerformanceAiInput always
// produces the same PerformanceAiOutput.
//
// Sentinel's own deterministic ratings (performance/ratings.ts) are the
// SOLE trigger for every finding below -- this file never recomputes a
// Core Web Vitals threshold itself, and never flags a metric whose rating
// is GOOD or UNKNOWN. TBT is deliberately never checked: ratings.ts's own
// rateTbt() always returns UNKNOWN by design (no official 3-tier
// threshold exists), so there is never a legitimate rating to trigger on.

interface MetricCheck {
  // Used only to build the evidence string, e.g. "fieldLcpMs".
  metricKey: string;
  label: string;
  rating: PerformanceRating;
  value: number | null;
  previousValue: number | null;
  previousRating: PerformanceRating | null;
  trend: "IMPROVING" | "REGRESSING" | "STABLE" | "UNKNOWN";
  explanation: string;
  recommendations: string[];
}

const SEVERITY_BY_RATING: Partial<Record<PerformanceRating, AiUrgency>> = {
  POOR: "HIGH",
  NEEDS_IMPROVEMENT: "MEDIUM",
};

function buildEvidence(check: MetricCheck): string[] {
  const evidence: string[] = [`${check.metricKey} is ${check.value}ms (rated ${check.rating})`];
  if (check.previousValue !== null && check.previousRating !== null) {
    evidence.push(
      `previous ${check.metricKey} was ${check.previousValue}ms (rated ${check.previousRating}, trend ${check.trend})`
    );
  }
  return evidence;
}

function buildFinding(check: MetricCheck): PerformanceAiFinding | null {
  const severity = SEVERITY_BY_RATING[check.rating];
  if (!severity) return null; // GOOD or UNKNOWN -- not a problem to report

  const ratingLabel = check.rating === "POOR" ? "Poor" : "Needs-Improvement";

  return {
    title: `${ratingLabel} ${check.label}`,
    severity,
    evidence: buildEvidence(check),
    explanation: check.explanation,
    confidence: "MEDIUM",
    recommendations: check.recommendations,
  };
}

// CLS is a unitless shift score, not milliseconds -- its own evidence
// string must not claim an "ms" unit the way every timing metric's does.
function buildClsFinding(check: Omit<MetricCheck, "value" | "previousValue"> & { value: number | null; previousValue: number | null }): PerformanceAiFinding | null {
  const severity = SEVERITY_BY_RATING[check.rating];
  if (!severity) return null;

  const ratingLabel = check.rating === "POOR" ? "Poor" : "Needs-Improvement";
  const evidence = [`${check.metricKey} is ${check.value} (rated ${check.rating})`];
  if (check.previousValue !== null && check.previousRating !== null) {
    evidence.push(`previous ${check.metricKey} was ${check.previousValue} (rated ${check.previousRating}, trend ${check.trend})`);
  }

  return {
    title: `${ratingLabel} ${check.label}`,
    severity,
    evidence,
    explanation: check.explanation,
    confidence: "MEDIUM",
    recommendations: check.recommendations,
  };
}

const URGENCY_RANK: Record<AiUrgency, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "deterministic-v1";

  async analyzePerformance(input: PerformanceAiInput): Promise<PerformanceAiOutput> {
    const { current, previous, trend } = input;
    const findings: PerformanceAiFinding[] = [];

    // LCP: prefer field (real-user CrUX) data; fall back to lab when field
    // is UNKNOWN (commonly missing for lower-traffic sites, per ratings.ts).
    const useFieldLcp = current.ratings.fieldLcpMs !== "UNKNOWN";
    const lcpFinding = buildFinding({
      metricKey: useFieldLcp ? "fieldLcpMs" : "labLcpMs",
      label: "Largest Contentful Paint",
      rating: useFieldLcp ? current.ratings.fieldLcpMs : current.ratings.labLcpMs,
      value: useFieldLcp ? current.field.lcpMs : current.lab.lcpMs,
      previousValue: previous ? (useFieldLcp ? previous.field.lcpMs : previous.lab.lcpMs) : null,
      previousRating: previous ? (useFieldLcp ? previous.ratings.fieldLcpMs : previous.ratings.labLcpMs) : null,
      trend: trend.fieldLcpMs,
      explanation:
        "Slow rendering or loading of the page's main above-the-fold content may be contributing to this. Sentinel does not identify the specific LCP element -- inspect the Lighthouse report to find it.",
      recommendations: [
        "Inspect the LCP element in Lighthouse's full report",
        "Review above-the-fold image/resource optimization (size, format, compression)",
        "Review preload/fetch-priority strategy for critical above-the-fold assets",
      ],
    });
    if (lcpFinding) findings.push(lcpFinding);

    // CLS: same field-preferred, lab-fallback pattern as LCP.
    const useFieldCls = current.ratings.fieldCls !== "UNKNOWN";
    const clsFinding = buildClsFinding({
      metricKey: useFieldCls ? "fieldCls" : "labCls",
      label: "Cumulative Layout Shift",
      rating: useFieldCls ? current.ratings.fieldCls : current.ratings.labCls,
      value: useFieldCls ? current.field.cls : current.lab.cls,
      previousValue: previous ? (useFieldCls ? previous.field.cls : previous.lab.cls) : null,
      previousRating: previous ? (useFieldCls ? previous.ratings.fieldCls : previous.ratings.labCls) : null,
      trend: trend.fieldCls,
      explanation:
        "Visual instability during load (for example, content shifting after images, fonts, or embeds load) may be contributing to this.",
      recommendations: [
        "Identify which elements shift using Lighthouse's layout-shift details",
        "Reserve explicit width/height (or aspect-ratio) for images and embeds",
        "Avoid injecting content above existing content after the initial render",
      ],
    });
    if (clsFinding) findings.push(clsFinding);

    // INP: field-only (no lab equivalent exists in this contract).
    const inpFinding = buildFinding({
      metricKey: "fieldInpMs",
      label: "Interaction to Next Paint",
      rating: current.ratings.fieldInpMs,
      value: current.field.inpMs,
      previousValue: previous?.field.inpMs ?? null,
      previousRating: previous?.ratings.fieldInpMs ?? null,
      trend: trend.fieldInpMs,
      explanation:
        "Slow responsiveness to real user interaction may be contributing to this -- long JavaScript execution on the main thread is a common cause.",
      recommendations: [
        "Profile long JavaScript tasks on the main thread",
        "Break up large synchronous work into smaller chunks",
        "Review third-party scripts for interaction-blocking behavior",
      ],
    });
    if (inpFinding) findings.push(inpFinding);

    // FCP: lab-only (no field equivalent exists in this contract).
    const fcpFinding = buildFinding({
      metricKey: "labFcpMs",
      label: "First Contentful Paint",
      rating: current.ratings.labFcpMs,
      value: current.lab.fcpMs,
      previousValue: previous?.lab.fcpMs ?? null,
      previousRating: previous?.ratings.labFcpMs ?? null,
      trend: trend.labFcpMs,
      explanation:
        "A delay before the first visible content renders may be contributing to this -- render-blocking resources or slow server response are common causes.",
      recommendations: [
        "Review render-blocking CSS/JS in the critical rendering path",
        "Check server/backend response time for the initial document",
        "Consider reducing critical-path resource size",
      ],
    });
    if (fcpFinding) findings.push(fcpFinding);

    // TTFB: field-only (no lab equivalent exists in this contract).
    const ttfbFinding = buildFinding({
      metricKey: "fieldTtfbMs",
      label: "Time to First Byte",
      rating: current.ratings.fieldTtfbMs,
      value: current.field.ttfbMs,
      previousValue: previous?.field.ttfbMs ?? null,
      previousRating: previous?.ratings.fieldTtfbMs ?? null,
      trend: trend.fieldTtfbMs,
      explanation:
        "A slow initial server response may be contributing to this -- server/backend processing time or hosting/network latency are common causes.",
      recommendations: [
        "Investigate backend/server processing time for this request",
        "Review hosting/CDN/network latency to this page's origin",
        "Check for slow database queries or uncached server-side work",
      ],
    });
    if (ttfbFinding) findings.push(ttfbFinding);

    // TBT is deliberately never checked -- ratings.ts's rateTbt() always
    // returns UNKNOWN (no official 3-tier threshold exists), so there is
    // never a legitimate rating to trigger a finding from.

    if (findings.length === 0) {
      return {
        summary: "No significant performance problems were found in this check.",
        priority: "LOW",
        findings: [],
      };
    }

    const overallPriority = findings.reduce<AiUrgency>(
      (worst, f) => (URGENCY_RANK[f.severity] > URGENCY_RANK[worst] ? f.severity : worst),
      "LOW"
    );

    return {
      summary: `Found ${findings.length} performance issue${findings.length === 1 ? "" : "s"} in this check (highest priority: ${overallPriority}).`,
      priority: overallPriority,
      findings,
    };
  }

  // Stage 18.3: deterministic SEO diagnosis -- a pure function of SeoAiInput.
  // Sentinel's own issue severities (seo/issues.ts) are the SOLE trigger: one
  // finding per ERROR/WARNING issue (INFO is never escalated), capped at the
  // validator's 10-finding limit. Evidence restates only Sentinel's own issue
  // text (FACT); the explanation is hedged (INFERENCE); the recommendation is
  // the issue's own fixed recommendation. Every string is capped to the
  // diagnosis-validation.ts bounds.
  async analyzeSeo(input: SeoAiInput): Promise<DiagnosisAiOutput> {
    const cap = (value: string, max: number) => (value.length <= max ? value : value.slice(0, max - 1) + "…");
    const alertable = input.issues.filter((i) => i.severity === "ERROR" || i.severity === "WARNING");

    const findings: DiagnosisAiFinding[] = alertable.slice(0, 10).map((issue) => ({
      title: cap(`SEO issue: ${issue.code}`, 150),
      severity: issue.severity === "ERROR" ? "HIGH" : "MEDIUM",
      evidence: [cap(issue.message, 300), ...(issue.evidence ? [cap(issue.evidence, 300)] : [])],
      explanation: cap(
        issue.severity === "ERROR"
          ? "Sentinel AI flagged this as an error. It may prevent search engines from crawling, indexing, or correctly understanding this page."
          : "Sentinel AI flagged this as a warning. It may reduce how clearly search engines understand or present this page; impact varies by page and site.",
        1000
      ),
      confidence: "MEDIUM",
      recommendations: [cap(issue.recommendation, 300)],
    }));

    const limitations = [
      "Only this single page and this single check were analyzed.",
      "No search ranking, traffic, or Search Console data was available.",
      "Page text was not provided -- only lengths and counts -- so no specific wording is suggested.",
    ];

    if (findings.length === 0) {
      return {
        summary: "No SEO errors or warnings were found in this check.",
        priority: "LOW",
        findings: [],
        limitations,
      };
    }

    const priority: AiUrgency = alertable.some((i) => i.severity === "ERROR") ? "HIGH" : "MEDIUM";
    return {
      summary: `Found ${alertable.length} SEO issue${alertable.length === 1 ? "" : "s"} needing attention (highest priority: ${priority}).`,
      priority,
      findings,
      limitations,
    };
  }

  // Stage 18.5: deterministic uptime incident diagnosis -- a pure function
  // of IncidentAiInput. Evidence restates only supplied counts/durations
  // (FACT); explanations are hedged and keyed ONLY on how checks failed
  // (server errors vs timeouts vs fast failures), never a stated root
  // cause (INFERENCE).
  // Limitations always state what monitoring cannot know.
  async analyzeIncident(input: IncidentAiInput): Promise<DiagnosisAiOutput> {
    const { incident, window: w, history } = input;
    const open = incident.status === "OPEN";
    const minutes = incident.durationMs !== null ? Math.max(1, Math.round(incident.durationMs / 60000)) : null;

    const evidence = [
      `${w.failedChecks} of ${w.totalChecks} checks in the incident window failed.`,
      `${w.serverErrorFailures} failure(s) were HTTP 5xx server error responses.`,
      `${w.timeoutFailures} failure(s) reached the ${input.monitoring.requestTimeoutMs} ms request timeout; ${w.fastFailures} failed faster than that.`,
      open
        ? `The incident is still open (started ${incident.startedAt}).`
        : `The incident lasted about ${minutes} minute(s) (from ${incident.startedAt} to ${incident.resolvedAt}).`,
    ];

    const noAnswer = w.timeoutFailures + w.fastFailures;
    const mostlyServerErrors = w.serverErrorFailures > noAnswer;
    const mostlyTimeouts = w.timeoutFailures > w.fastFailures;
    const explanation = mostlyServerErrors
      ? "Most failed checks received an HTTP 5xx response, so the server was reachable but answered with an error. This may indicate an application crash, a failing backend or database, or an overloaded server. What caused the error inside the server is not known."
      : mostlyTimeouts
      ? "Most failed checks waited until the request timeout. This may indicate an overloaded or unresponsive server, or a network path problem between the monitor and the site. The exact reason was not recorded."
      : "Most failed checks failed quickly, before the request timeout. This may indicate a DNS, connection-refused, or TLS/certificate problem. The exact reason was not recorded.";

    const findings: DiagnosisAiFinding[] = [
      {
        title: mostlyServerErrors
          ? open
            ? "Website is returning server errors"
            : "Website returned server errors"
          : open
            ? "Website is currently unreachable"
            : "Website was unreachable",
        severity: open ? "CRITICAL" : "HIGH",
        evidence,
        explanation,
        confidence: "LOW",
        recommendations: [
          "Check your hosting provider's status page and the server's error logs for this time window.",
          "Verify DNS records and that the domain resolves correctly.",
          "Check that the SSL/TLS certificate is valid and not expired.",
          "Review firewall, CDN, or rate-limiting rules that might block requests.",
        ],
      },
    ];

    if (history.otherIncidentsLast30Days >= 2) {
      findings.push({
        title: "Recurring incidents",
        severity: "MEDIUM",
        evidence: [`${history.otherIncidentsLast30Days} other incident(s) started in the 30 days before this one.`],
        explanation:
          "Repeated incidents may point to an ongoing infrastructure or configuration issue rather than a one-off event.",
        confidence: "LOW",
        recommendations: ["Compare these incident times with deploys, traffic peaks, or hosting maintenance windows."],
      });
    }

    return {
      summary: open
        ? `The website has been down since ${incident.startedAt}; ${w.failedChecks} checks have failed so far.`
        : `The website was down for about ${minutes} minute(s) and has since recovered.`,
      priority: open ? "CRITICAL" : "HIGH",
      findings,
      limitations: [
        "For failures without a response, the reason (timeout, DNS, connection, TLS) is not recorded by monitoring.",
        "Checks run from a single location, so a network-path issue cannot be ruled out.",
        "For HTTP 5xx responses, only the status code is known, not the error inside the server.",
        "No server logs were available.",
      ],
    };
  }
}
