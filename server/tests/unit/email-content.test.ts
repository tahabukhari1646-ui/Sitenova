// Stage 19.2: email building -- every alert type has content, website text
// can never inject HTML, links point at the right page, and provider
// selection fails safe.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEmailPayload, resolveAppBaseUrl } from "../../src/modules/email-delivery/payload";
import { escapeHtml } from "../../src/modules/email-delivery/html";
import { EmailPayloadError } from "../../src/modules/email-delivery/payload-errors";
import { MockEmailProvider } from "../../src/integrations/email/mock-provider";
import { resolveEmailProviderName } from "../../src/integrations/email/factory";
import type { AlertType } from "../../src/generated/prisma/client";
import { withEnv } from "../helpers/safety";

const ALERT_TYPES: AlertType[] = [
  "INCIDENT_OPENED",
  "INCIDENT_RESOLVED",
  "SEO_ISSUE_OPENED",
  "SEO_ISSUE_RESOLVED",
  "PERFORMANCE_DEGRADED",
  "PERFORMANCE_RECOVERED",
];

function payloadFor(overrides: { type?: AlertType; name?: string | null; url?: string; email?: string; message?: string | null } = {}) {
  return buildEmailPayload({
    deliveryId: "delivery-1",
    websiteId: "website-1",
    alert: {
      type: overrides.type ?? "INCIDENT_OPENED",
      severity: "ERROR",
      code: null,
      message: overrides.message ?? null,
      createdAt: new Date("2026-01-02T03:04:00Z"),
    },
    website: { name: overrides.name === undefined ? "My Shop" : overrides.name, url: overrides.url ?? "https://shop.example.invalid/" },
    user: { email: overrides.email ?? "owner@example.invalid" },
  });
}

describe("buildEmailPayload", () => {
  it("produces a subject, HTML and text for every alert type", () => {
    for (const type of ALERT_TYPES) {
      const payload = payloadFor({ type });
      assert.ok(payload.subject.includes("My Shop"), type);
      assert.ok(payload.html.length > 0 && (payload.text ?? "").length > 0, type);
    }
    assert.equal(payloadFor({ type: "INCIDENT_OPENED" }).subject, "[DOWN] My Shop");
    assert.equal(payloadFor({ type: "INCIDENT_RESOLVED" }).subject, "[RECOVERED] My Shop");
  });

  it("escapes website names and alert messages in the HTML", () => {
    const hostile = '<script>alert("x")</script>';
    const payload = payloadFor({ type: "SEO_ISSUE_OPENED", name: hostile, message: `<img src=x onerror=alert(1)>` });
    assert.ok(!payload.html.includes("<script>"));
    assert.ok(!payload.html.includes("<img"));
    assert.ok(payload.html.includes("&lt;script&gt;"));
  });

  it("uses the site's hostname when it has no name", () => {
    assert.equal(payloadFor({ name: null }).subject, "[DOWN] shop.example.invalid");
  });

  it("links to the website page and uses a stable idempotency key", () => {
    const payload = payloadFor();
    assert.ok(payload.html.includes("http://localhost:3000/websites/website-1"));
    assert.equal(payload.idempotencyKey, "sentinel-email-delivery-1");
    assert.equal(payload.to, "owner@example.invalid");
  });

  it("refuses to build an email with no recipient or website URL", () => {
    assert.throws(() => payloadFor({ email: "  " }), (e) => e instanceof EmailPayloadError && e.code === "MISSING_DATA");
    assert.throws(() => payloadFor({ url: " " }), (e) => e instanceof EmailPayloadError && e.code === "MISSING_DATA");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML special characters exactly once", () => {
    assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;");
  });
});

describe("resolveAppBaseUrl", () => {
  it("defaults to localhost in development and to no link in production", async () => {
    await withEnv({ APP_BASE_URL: undefined, NODE_ENV: "development" }, async () => {
      assert.equal(resolveAppBaseUrl(), "http://localhost:3000");
    });
    await withEnv({ APP_BASE_URL: undefined, NODE_ENV: "production" }, async () => {
      assert.equal(resolveAppBaseUrl(), null);
    });
  });

  it("rejects unsafe values and trims trailing slashes", async () => {
    for (const bad of ["javascript:alert(1)", "not a url", "https://user:pass@app.example.invalid"]) {
      await withEnv({ APP_BASE_URL: bad }, async () => assert.equal(resolveAppBaseUrl(), null, bad));
    }
    await withEnv({ APP_BASE_URL: "https://app.example.invalid/" }, async () => {
      assert.equal(resolveAppBaseUrl(), "https://app.example.invalid");
    });
  });
});

describe("email providers", () => {
  it("the mock is deterministic and its ids can never look like real ones", async () => {
    const mock = new MockEmailProvider();
    const input = { to: "a@example.invalid", subject: "s", html: "<p>h</p>", text: "h", idempotencyKey: "k" };
    const first = await mock.send(input);
    assert.match(first.providerMessageId, /^mock-email-[0-9a-f]{24}$/);
    assert.deepEqual(await mock.send(input), first);
  });

  it("selection: mock by default in development, never silently in production, unknown names rejected", async () => {
    await withEnv({ EMAIL_PROVIDER: undefined, NODE_ENV: "development" }, async () => {
      assert.deepEqual(resolveEmailProviderName(), { ok: true, name: "mock" });
    });
    await withEnv({ EMAIL_PROVIDER: undefined, NODE_ENV: "production" }, async () => {
      assert.equal(resolveEmailProviderName().ok, false);
    });
    await withEnv({ EMAIL_PROVIDER: "carrier-pigeon" }, async () => {
      assert.equal(resolveEmailProviderName().ok, false);
    });
    await withEnv({ EMAIL_PROVIDER: "resend" }, async () => {
      assert.deepEqual(resolveEmailProviderName(), { ok: true, name: "resend" });
    });
  });
});
