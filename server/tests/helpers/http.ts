// Stage 19.1: runs the real Express app on a random local port.
// Imports app.ts, NOT server.ts -- so the uptime, SEO and performance
// schedulers never start during tests.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import app from "../../src/app";
import { signAccessToken } from "../../src/utils/jwt";

export interface TestResponse {
  status: number;
  raw: string;
  // Parsed body; `any` keeps assertions on response fields readable.
  json: any;
}

export interface TestServer {
  request(method: string, path: string, options?: { token?: string; body?: unknown }): Promise<TestResponse>;
  close(): Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    async request(method, path, { token, body } = {}) {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const raw = await res.text();
      return { status: res.status, raw, json: raw ? JSON.parse(raw) : null };
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// A signed login token for a test user -- the same token the real login
// route would issue, without needing a password.
export function tokenFor(user: { id: string; email: string }): string {
  return signAccessToken({ userId: user.id, email: user.email });
}

export const aiPaths = {
  performance: (websiteId: string, checkId: string) =>
    `/websites/${websiteId}/performance-checks/${checkId}/ai-analysis`,
  seo: (websiteId: string, checkId: string) => `/websites/${websiteId}/seo-checks/${checkId}/ai-analysis`,
  uptime: (websiteId: string, incidentId: string) =>
    `/websites/${websiteId}/incidents/${incidentId}/ai-analysis`,
};

// The exact public response shape, in order: the original 8 keys, then
// `trigger` appended last (Stage 18.9).
export const RESPONSE_KEYS = {
  performance: ["id", "performanceCheckId", "provider", "model", "status", "inputFingerprint", "output", "createdAt", "trigger"],
  seo: ["id", "seoCheckId", "provider", "model", "status", "inputFingerprint", "output", "createdAt", "trigger"],
  uptime: ["id", "incidentId", "provider", "model", "status", "inputFingerprint", "output", "createdAt", "trigger"],
};
