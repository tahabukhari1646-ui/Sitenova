// Stage 17.4 §18: the ONE place dynamic text is made safe for HTML
// insertion. Every dynamic string (website name, URL, Alert message/code,
// severity, strategy label, timestamp) MUST pass through this before
// being placed inside templates.ts's markup -- "data should already be
// safe" is never assumed.
//
// `&` is replaced FIRST -- replacing it after the other entities would
// double-escape the ampersands those replacements themselves introduce
// (e.g. turning a literal `<` into `&lt;` and then re-escaping that `&`
// would produce `&amp;lt;`).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
