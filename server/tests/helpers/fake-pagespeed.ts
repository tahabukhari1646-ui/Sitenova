// Stage 19.3: a stand-in for Google PageSpeed Insights. While installed,
// requests to the PageSpeed API are answered locally with a saved-style
// response and recorded; every other request still goes through the
// suite's internet block. Google is never contacted.
export const FAKE_PAGESPEED_KEY = "fake-pagespeed-key-for-tests";
const PAGESPEED_HOST = "www.googleapis.com";

export interface PageSpeedCall {
  url: string | null;
  strategy: string | null;
  key: string | null;
}

// What the fake answers: an HTTP status + JSON body, raw text, or a
// network failure.
export type PageSpeedAnswer =
  | { status?: number; body: unknown }
  | { status?: number; text: string }
  | "network-error";

export interface FakePageSpeed {
  calls: PageSpeedCall[];
  answer(next: PageSpeedAnswer | ((call: PageSpeedCall) => PageSpeedAnswer)): void;
  restore(): void;
}

export function installFakePageSpeed(): FakePageSpeed {
  const previousFetch = globalThis.fetch;
  const calls: PageSpeedCall[] = [];
  let next: PageSpeedAnswer | ((call: PageSpeedCall) => PageSpeedAnswer) = { body: psiBody() };

  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    if (url.hostname !== PAGESPEED_HOST) return previousFetch(input, init);

    const call = {
      url: url.searchParams.get("url"),
      strategy: url.searchParams.get("strategy"),
      key: url.searchParams.get("key"),
    };
    calls.push(call);
    const answer = typeof next === "function" ? next(call) : next;
    if (answer === "network-error") throw new TypeError("fetch failed");
    const text = "text" in answer ? answer.text : JSON.stringify(answer.body);
    return new Response(text, { status: answer.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  return {
    calls,
    answer: (value) => {
      next = value;
    },
    restore: () => {
      globalThis.fetch = previousFetch;
    },
  };
}

export interface PsiOptions {
  score?: number | null; // 0..1, as Google sends it
  labLcpMs?: number;
  labCls?: number;
  labFcpMs?: number;
  labTbtMs?: number;
  // Field (real-user) data; null = none, normal for small sites.
  field?: { lcpMs: number; inpMs: number; clsX100: number; ttfbMs: number } | null;
}

export const GOOD_FIELD = { lcpMs: 1000, inpMs: 100, clsX100: 1, ttfbMs: 400 };
export const POOR_FIELD = { lcpMs: 6000, inpMs: 800, clsX100: 50, ttfbMs: 2500 };

// The shape of a real PageSpeed Insights v5 response (only the parts the
// app reads).
export function psiBody(options: PsiOptions = {}) {
  const { score = 0.95, labLcpMs = 1200, labCls = 0.012, labFcpMs = 900, labTbtMs = 50, field = GOOD_FIELD } = options;
  return {
    lighthouseResult: {
      categories: { performance: { score } },
      audits: {
        "largest-contentful-paint": { numericValue: labLcpMs, numericUnit: "millisecond" },
        "cumulative-layout-shift": { numericValue: labCls, numericUnit: "unitless" },
        "first-contentful-paint": { numericValue: labFcpMs, numericUnit: "millisecond" },
        "total-blocking-time": { numericValue: labTbtMs, numericUnit: "millisecond" },
      },
    },
    loadingExperience: field
      ? {
          metrics: {
            LARGEST_CONTENTFUL_PAINT_MS: { percentile: field.lcpMs },
            INTERACTION_TO_NEXT_PAINT: { percentile: field.inpMs },
            CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: field.clsX100 },
            EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: field.ttfbMs },
          },
        }
      : {},
  };
}
