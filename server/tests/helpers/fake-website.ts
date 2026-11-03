// Stage 19.2: a tiny website running on this computer (127.0.0.1), so the
// real uptime checker can be tested without touching the internet. Each
// test sets how it should answer next.
import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

// Stage 19.3: a specific answer for one path (e.g. "/robots.txt").
export interface FakePage {
  status?: number;
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
}

export interface FakeWebsite {
  url: string;
  port: number;
  // HTTP status the site answers with (default 200).
  respondWith(statusCode: number): void;
  // Answer with a 302 redirect to `location` (null = stop redirecting).
  redirectTo(location: string | null): void;
  // Stage 19.3: serve `page` at `path` (null = back to the default answer).
  setPage(path: string, page: FakePage | null): void;
  clearPages(): void;
  // Paths requested so far, in order.
  requestedPaths(): string[];
  requestCount(): number;
  close(): Promise<void>;
}

export async function startFakeWebsite(): Promise<FakeWebsite> {
  let statusCode = 200;
  const paths: string[] = [];
  let redirectLocation: string | null = null;
  const pages = new Map<string, FakePage>();
  const server = http.createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://fake").pathname;
    paths.push(path);
    const page = pages.get(path);
    if (page) {
      res.writeHead(page.status ?? 200, { "Content-Type": page.contentType ?? "text/html", ...page.headers });
      res.end(page.body ?? "");
      return;
    }
    if (redirectLocation) {
      res.writeHead(302, { Location: redirectLocation });
      res.end();
      return;
    }
    res.writeHead(statusCode, { "Content-Type": "text/html" });
    res.end("<html><body>fake site</body></html>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    respondWith: (code) => {
      statusCode = code;
    },
    redirectTo: (location) => {
      redirectLocation = location;
    },
    setPage: (path, page) => {
      if (page) pages.set(path, page);
      else pages.delete(path);
    },
    clearPages: () => pages.clear(),
    requestedPaths: () => [...paths],
    requestCount: () => paths.length,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// Nothing listens on port 1, so a check against this fails like a site
// that is down -- still local, so the internet block never sees it.
export const UNREACHABLE_URL = "http://127.0.0.1:1/";
