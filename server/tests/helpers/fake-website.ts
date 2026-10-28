// Stage 19.2: a tiny website running on this computer (127.0.0.1), so the
// real uptime checker can be tested without touching the internet. Each
// test sets how it should answer next.
import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

export interface FakeWebsite {
  url: string;
  // HTTP status the site answers with (default 200).
  respondWith(statusCode: number): void;
  // Answer with a 302 redirect to `location` (null = stop redirecting).
  redirectTo(location: string | null): void;
  requestCount(): number;
  close(): Promise<void>;
}

export async function startFakeWebsite(): Promise<FakeWebsite> {
  let statusCode = 200;
  let requests = 0;
  let redirectLocation: string | null = null;
  const server = http.createServer((_req, res) => {
    requests++;
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

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    respondWith: (code) => {
      statusCode = code;
    },
    redirectTo: (location) => {
      redirectLocation = location;
    },
    requestCount: () => requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// Nothing listens on port 1, so a check against this fails like a site
// that is down -- still local, so the internet block never sees it.
export const UNREACHABLE_URL = "http://127.0.0.1:1/";
