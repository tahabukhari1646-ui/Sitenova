// Stage P2: shared "is this a non-empty string if present" shape check for
// the optional `url`/pageUrl input, mirroring
// performance/validation.ts's extractPageUrl exactly. Deliberately does NOT
// parse/normalize/validate the URL itself — that remains
// utils/pageUrl.ts's job (resolvePageUrl), invoked by the service layer,
// matching this codebase's existing "validation.ts checks shape, service.ts
// enforces domain rules" layering.

type PageUrlValidationResult =
  | { valid: true; pageUrl: string | undefined }
  | { valid: false; error: string };

function extractPageUrl(source: Record<string, unknown> | undefined): PageUrlValidationResult {
  const raw = source?.url;
  if (raw === undefined) return { valid: true, pageUrl: undefined };
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { valid: false, error: "'url' must be a non-empty string if provided." };
  }
  return { valid: true, pageUrl: raw };
}

export const seoValidation = {
  // POST /:id/seo/check — url is an optional body field.
  validatePageUrlBody: (body: unknown): PageUrlValidationResult => {
    return extractPageUrl(body as Record<string, unknown> | undefined);
  },
  // GET /:id/seo/latest and GET /:id/seo — url is an optional query filter.
  validatePageUrlQuery: (query: unknown): PageUrlValidationResult => {
    return extractPageUrl(query as Record<string, unknown> | undefined);
  },
};
