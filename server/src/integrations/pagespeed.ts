import { AppError } from "../errors/AppError";

// PSI itself runs a real Lighthouse audit server-side, which routinely takes
// well over 10s (observed 10-20s+ in practice) — this is independent of and
// much longer than the 10s timeout used for the existing uptime HTTP check.
const REQUEST_TIMEOUT_MS = 45_000;
const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type PageSpeedStrategy = "MOBILE" | "DESKTOP";

export interface PageSpeedResult {
  performanceScore: number | null;
  labLcpMs: number | null;
  labCls: number | null;
  labFcpMs: number | null;
  labTbtMs: number | null;
  fieldLcpMs: number | null;
  fieldCls: number | null;
  fieldInpMs: number | null;
  fieldTtfbMs: number | null;
}

// 502: this represents an upstream (Google PSI) failure, not a client
// mistake — fits the existing AppError/errorHandler convention so a future
// API layer (Stage 13.3) can throw this straight through without translation.
export class PageSpeedError extends AppError {
  constructor(message: string) {
    super(message, 502);
    this.name = "PageSpeedError";
  }
}

function toPsiStrategy(strategy: PageSpeedStrategy): "mobile" | "desktop" {
  return strategy === "MOBILE" ? "mobile" : "desktop";
}

// Lighthouse lab audit numericValue -> whole milliseconds. Verified against a
// real PSI v5 response: audits["largest-contentful-paint"/"first-contentful-paint"
// /"total-blocking-time"].numericValue, numericUnit "millisecond".
function labMsOrNull(audit: unknown): number | null {
  if (!audit || typeof audit !== "object") return null;
  const value = (audit as { numericValue?: unknown }).numericValue;
  return typeof value === "number" ? Math.round(value) : null;
}

// CLS's numericValue is a small decimal (e.g. 0.00038...) — must NOT be
// rounded to whole numbers like the ms-based audits above.
function labUnitlessOrNull(audit: unknown): number | null {
  if (!audit || typeof audit !== "object") return null;
  const value = (audit as { numericValue?: unknown }).numericValue;
  return typeof value === "number" ? value : null;
}

// CrUX field metric .percentile -> whole milliseconds for the timing metrics.
// Verified against real PSI responses: loadingExperience.metrics.
// {LARGEST_CONTENTFUL_PAINT_MS,INTERACTION_TO_NEXT_PAINT,EXPERIMENTAL_TIME_TO_FIRST_BYTE}.percentile.
function fieldMsOrNull(metric: unknown): number | null {
  if (!metric || typeof metric !== "object") return null;
  const value = (metric as { percentile?: unknown }).percentile;
  return typeof value === "number" ? Math.round(value) : null;
}

// CLS's field percentile is scaled x100 relative to the real CLS decimal —
// confirmed empirically: CUMULATIVE_LAYOUT_SHIFT_SCORE's distribution bucket
// boundaries are exactly 10/25, matching CLS's official 0.10/0.25 thresholds
// scaled x100. Divide by 100 to store the real decimal value.
function fieldClsOrNull(metric: unknown): number | null {
  if (!metric || typeof metric !== "object") return null;
  const value = (metric as { percentile?: unknown }).percentile;
  return typeof value === "number" ? value / 100 : null;
}

function parsePageSpeedResponse(body: unknown): PageSpeedResult {
  const data = body as {
    lighthouseResult?: {
      categories?: { performance?: { score?: unknown } };
      audits?: Record<string, unknown>;
      runtimeError?: { code?: string; message?: string };
    };
    loadingExperience?: { metrics?: Record<string, unknown> };
  };

  const lighthouseResult = data.lighthouseResult;

  if (!lighthouseResult || typeof lighthouseResult !== "object") {
    throw new PageSpeedError(
      "PageSpeed Insights response is missing lighthouseResult."
    );
  }

  if (lighthouseResult.runtimeError?.code) {
    throw new PageSpeedError(
      `PageSpeed Insights (Lighthouse) reported a runtime error: ${
        lighthouseResult.runtimeError.message ?? lighthouseResult.runtimeError.code
      }`
    );
  }

  const audits = lighthouseResult.audits ?? {};
  const rawScore = lighthouseResult.categories?.performance?.score;
  const performanceScore =
    typeof rawScore === "number" ? Math.round(rawScore * 100) : null;

  const labLcpMs = labMsOrNull(audits["largest-contentful-paint"]);
  const labCls = labUnitlessOrNull(audits["cumulative-layout-shift"]);
  const labFcpMs = labMsOrNull(audits["first-contentful-paint"]);
  const labTbtMs = labMsOrNull(audits["total-blocking-time"]);

  if (performanceScore === null && labLcpMs === null && labFcpMs === null) {
    // A 200 response with none of the core lab signals present means the
    // measurement itself is unusable — do not let the caller persist an
    // all-null row silently.
    throw new PageSpeedError(
      "PageSpeed Insights response did not contain usable Lighthouse lab metrics."
    );
  }

  // Field/CrUX data is legitimately absent for lower-traffic sites (verified
  // empirically) — this is normal, not an error, so every field metric here
  // is allowed to resolve to null without throwing.
  const fieldMetrics = data.loadingExperience?.metrics ?? {};
  const fieldLcpMs = fieldMsOrNull(fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS);
  const fieldCls = fieldClsOrNull(fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE);
  const fieldInpMs = fieldMsOrNull(fieldMetrics.INTERACTION_TO_NEXT_PAINT);
  const fieldTtfbMs = fieldMsOrNull(fieldMetrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE);

  return {
    performanceScore,
    labLcpMs,
    labCls,
    labFcpMs,
    labTbtMs,
    fieldLcpMs,
    fieldCls,
    fieldInpMs,
    fieldTtfbMs,
  };
}

export async function runPageSpeedCheck(
  url: string,
  strategy: PageSpeedStrategy
): Promise<PageSpeedResult> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    throw new PageSpeedError("PAGESPEED_API_KEY is not configured.");
  }

  const endpoint = new URL(PSI_ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", toPsiStrategy(strategy));
  endpoint.searchParams.set("category", "performance");
  endpoint.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Deliberately no `error` interpolation here: never risk the request
    // URL (which contains the API key) ending up in a thrown message/log.
    throw new PageSpeedError(
      "PageSpeed Insights request failed (network error or timeout)."
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PageSpeedError("PageSpeed Insights returned a non-JSON response.");
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(
            (body as { error?: { message?: string } }).error?.message ??
              response.statusText
          )
        : response.statusText;
    throw new PageSpeedError(`PageSpeed Insights request failed: ${message}`);
  }

  return parsePageSpeedResponse(body);
}
