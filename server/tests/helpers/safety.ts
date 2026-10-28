// Stage 19.1: helpers that keep tests honest about cost and side effects.
import assert from "node:assert/strict";
import { MockAiProvider } from "../../src/integrations/ai/mock-provider";

// --- Internet block (installed by setup/preload.ts) ---
export function blockedExternalRequests(): string[] {
  return (globalThis as typeof globalThis & { __blockedExternalRequests?: string[] }).__blockedExternalRequests ?? [];
}

export function assertNoExternalRequests(): void {
  assert.deepEqual(blockedExternalRequests(), [], "a test tried to reach the internet");
}

// --- Fake DNS (installed by setup/preload.ts) ---
// Makes `hostname` resolve to `addresses` for the rest of this test file.
export function setTestDnsRecord(hostname: string, addresses: string[]): void {
  const records = (globalThis as typeof globalThis & { __testDnsRecords?: Map<string, { address: string; family: number }[]> })
    .__testDnsRecords!;
  records.set(
    hostname.toLowerCase(),
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))
  );
}

// --- Mock AI call counter ---
// Counts every time the (free) mock provider is asked for an analysis, so
// tests can prove when a "paid" call would or would not have happened.
let mockCalls = 0;
let crashNextSeoCalls = false;
const proto = MockAiProvider.prototype as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
for (const method of ["analyzePerformance", "analyzeSeo", "analyzeIncident"]) {
  const original = proto[method];
  proto[method] = async function (this: unknown, ...args: unknown[]) {
    mockCalls++;
    if (method === "analyzeSeo" && crashNextSeoCalls) throw new Error("simulated unexpected AI crash");
    return original.apply(this, args);
  };
}

export function aiCallCount(): number {
  return mockCalls;
}

export function simulateSeoAiCrash(enabled: boolean): void {
  crashNextSeoCalls = enabled;
}

// --- Temporary environment changes ---
// Sets env vars for the duration of `fn` only (undefined = unset), then
// restores the previous values even if `fn` throws.
export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// Every test file runs a POST and then wants a SECOND paid run soon after;
// the default 30s cooldown would block it, so most tests disable it.
export const NO_COOLDOWN = { AI_MANUAL_COOLDOWN_SECONDS: "0" };
