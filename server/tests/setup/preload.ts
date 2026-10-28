// Stage 19.1: loaded before EVERY test file (node --import), before any app
// code. It points the app at the throwaway test database and makes every
// paid or outside service unreachable, so a test run can never cost money,
// send an email, or touch real data.
import path from "node:path";
import dns from "node:dns";
import net from "node:net";
import dotenv from "dotenv";
import { assertSafeTestDatabaseName, databaseNameOf, resolveTestDatabaseUrl } from "./test-database";

// Only DATABASE_URL is taken from server/.env (to find Postgres). The file's
// values never override what is set below.
const fileEnv = dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true }).parsed ?? {};
const developmentUrl = fileEnv.DATABASE_URL ?? process.env.DATABASE_URL;

process.env.DATABASE_URL = resolveTestDatabaseUrl(developmentUrl);
assertSafeTestDatabaseName(
  databaseNameOf(process.env.DATABASE_URL),
  developmentUrl ? databaseNameOf(developmentUrl) : undefined
);

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "sitenova-test-suite-only-secret";
process.env.AI_PROVIDER = "mock";
process.env.EMAIL_PROVIDER = "mock";
// Real keys are removed, so even a test that switches AI_PROVIDER to
// "openai" can only reach the "not configured" path.
for (const key of ["OPENAI_API_KEY", "RESEND_API_KEY", "PAGESPEED_API_KEY"]) delete process.env[key];
// Cost-control settings start at their built-in defaults; tests that need
// other values set them explicitly with withEnv().
for (const key of ["AI_MANUAL_COOLDOWN_SECONDS", "AI_MANUAL_DAILY_LIMIT", "AI_AUTOMATIC_ENABLED"]) {
  delete process.env[key];
}

// Stage 20.1: lets safeFetch reach the local fake website (127.x / ::1
// only -- private networks stay blocked). Tests that prove loopback is
// refused turn this off with withEnv().
process.env.SAFE_FETCH_ALLOW_LOOPBACK_FOR_TESTS = "true";

// DNS block: no real DNS queries during tests. Names registered with
// setTestDnsRecord() (tests/helpers/safety.ts) resolve to the given
// addresses; "localhost" and literal IPs behave normally; every other name
// fails as "not found", like an unregistered domain.
const testDnsRecords = new Map<string, { address: string; family: number }[]>();
(globalThis as typeof globalThis & { __testDnsRecords?: typeof testDnsRecords }).__testDnsRecords = testDnsRecords;
const realLookup = dns.lookup;
(dns as { lookup: unknown }).lookup = (hostname: string, options: unknown, callback?: unknown) => {
  const cb = (typeof options === "function" ? options : callback) as (...args: unknown[]) => void;
  const opts = (typeof options === "object" && options !== null ? options : {}) as { all?: boolean };
  const records = testDnsRecords.get(hostname.toLowerCase());
  if (records) {
    process.nextTick(() => (opts.all ? cb(null, records) : cb(null, records[0].address, records[0].family)));
    return;
  }
  if (hostname === "localhost" || net.isIP(hostname)) {
    return (realLookup as (...args: unknown[]) => void)(hostname, options, callback);
  }
  process.nextTick(() => cb(Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" })));
};

// Internet block: any fetch to a host other than this machine fails and is
// counted. Every test file asserts the count is still 0 at the end.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const realFetch = globalThis.fetch;
const guard = globalThis as typeof globalThis & { __blockedExternalRequests?: string[] };
guard.__blockedExternalRequests = [];

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    guard.__blockedExternalRequests!.push(host);
    throw new Error(`Blocked by the test suite: outside network request to ${host}`);
  }
  return realFetch(input, init);
}) as typeof fetch;
