import { escapeHtml } from "./html";
import type { EmailEventContent } from "./content";

export interface RenderEmailOptions {
  // null when APP_BASE_URL could not be safely resolved (payload.ts's
  // resolveAppBaseUrl) -- both renderers omit the action link/button
  // entirely rather than ever emitting a broken or unsafe URL (Stage
  // 17.4 §21/§22).
  actionUrl: string | null;
}

const BRAND = "Sentinel AI";

// Stage 17.4 §19: simple, email-client-friendly HTML -- a single-column
// table shell, inline styles only, no JavaScript/forms/iframe/SVG/
// external CSS/external font/tracking pixel. Still reads sensibly as
// plain structure if styles are stripped by a client.
//
// Every dynamic value (heading/summary/facts/actionLabel/actionUrl) is
// passed through escapeHtml immediately before insertion -- content.ts
// only ever produces plain, unescaped strings; this is the one place
// escaping actually happens (Stage 17.4 §18, CRITICAL).
export function renderEmailHtml(content: EmailEventContent, options: RenderEmailOptions): string {
  const factsHtml = content.facts
    .map((fact) => `<li style="margin:0 0 4px 0;">${escapeHtml(fact)}</li>`)
    .join("");

  const actionHtml = options.actionUrl
    ? `<p style="margin:24px 0 0 0;"><a href="${escapeHtml(options.actionUrl)}" style="display:inline-block;padding:10px 16px;background-color:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">${escapeHtml(content.actionLabel)}</a></p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;padding:24px;">
            <tr>
              <td style="font-size:13px;color:#6b7280;padding-bottom:16px;">${escapeHtml(BRAND)} &middot; Website alert</td>
            </tr>
            <tr>
              <td style="font-size:18px;font-weight:bold;padding-bottom:12px;">${escapeHtml(content.heading)}</td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:20px;padding-bottom:12px;">${escapeHtml(content.summary)}</td>
            </tr>
            <tr>
              <td>
                <ul style="font-size:13px;color:#374151;padding-left:18px;margin:0;">${factsHtml}</ul>
              </td>
            </tr>
            <tr>
              <td>${actionHtml}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Stage 17.4 §20: built intentionally from the SAME normalized
// EmailEventContent as the HTML version -- never derived by stripping
// HTML tags with a regex. Plain text needs no escaping (there is no
// markup to break out of), so hostile input simply renders as harmless
// literal text.
export function renderEmailText(content: EmailEventContent, options: RenderEmailOptions): string {
  const lines = [
    `${BRAND} - Website alert`,
    "",
    content.heading,
    "",
    content.summary,
    "",
    ...content.facts,
  ];

  if (options.actionUrl) {
    lines.push("", `${content.actionLabel}: ${options.actionUrl}`);
  }

  return lines.join("\n");
}
