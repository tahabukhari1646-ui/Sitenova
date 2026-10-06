import { load } from "cheerio";
import type { ParsedSeoPage, SeoStructuredData } from "./types";

// Pure and DB/network-free by design (mirrors performance/stats.ts and
// performance/ratings.ts's own "pure, independently testable" discipline) —
// takes already-fetched HTML text and the page's final URL, returns raw
// observations only. No Prisma, no safeFetch, no issue/rating logic.

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function nullIfEmpty(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  return normalized.length > 0 ? normalized : null;
}

function extractTitle($: ReturnType<typeof load>): string | null {
  const raw = $("title").first().text();
  return nullIfEmpty(raw);
}

// Case-insensitive on the `name` attribute — Cheerio's attribute selectors
// do exact string matches, which would miss e.g. <meta name="Description">.
function findMetaByName($: ReturnType<typeof load>, name: string) {
  return $("meta").filter((_, el) => {
    const attr = $(el).attr("name");
    return typeof attr === "string" && attr.toLowerCase() === name.toLowerCase();
  });
}

function extractMetaDescription($: ReturnType<typeof load>): string | null {
  const content = findMetaByName($, "description").first().attr("content");
  return typeof content === "string" ? nullIfEmpty(content) : null;
}

function extractRobotsMeta($: ReturnType<typeof load>): string | null {
  const content = findMetaByName($, "robots").first().attr("content");
  return typeof content === "string" ? nullIfEmpty(content) : null;
}

interface HeadingFacts {
  h1Count: number;
  h1Text: string | null;
  h2Count: number;
  h3Count: number;
}

function extractHeadings($: ReturnType<typeof load>): HeadingFacts {
  const h1s = $("h1");
  const h1Text = h1s.length > 0 ? nullIfEmpty(h1s.first().text()) : null;

  return {
    h1Count: h1s.length,
    h1Text,
    h2Count: $("h2").length,
    h3Count: $("h3").length,
  };
}

// Rel is a space-separated token list per the HTML spec (e.g.
// rel="canonical" but also legally rel="alternate canonical") — token
// matching rather than exact-string equality on the raw attribute is what
// "robust" means here, not just case-insensitivity.
function hasRelToken(relAttr: string | undefined, token: string): boolean {
  if (!relAttr) return false;
  return relAttr
    .split(/\s+/)
    .some((candidate) => candidate.toLowerCase() === token);
}

function extractCanonicalUrl($: ReturnType<typeof load>): string | null {
  const canonicalLink = $("link").filter((_, el) => hasRelToken($(el).attr("rel"), "canonical"));
  const href = canonicalLink.first().attr("href");
  return typeof href === "string" ? nullIfEmpty(href) : null;
}

interface LinkCounts {
  internalLinkCount: number;
  externalLinkCount: number;
}

// Semantics (documented explicitly, per Stage 14.3 §14):
// - "internal" = resolves to an http(s) URL whose hostname EXACTLY matches
//   the final page's hostname (case-insensitive). www.example.com and
//   example.com are treated as different hosts — a deliberate, simple, fully
//   deterministic V1 rule; no eTLD+1/"same site" fuzzing.
// - mailto:, tel:, javascript:, empty/whitespace-only href, and fragment-only
//   href ("#...") are skipped entirely — counted as neither internal nor
//   external.
// - A malformed href that new URL() cannot resolve against finalUrl is also
//   skipped rather than guessed at.
// - Every qualifying <a> element is counted (no deduplication of repeated
//   destinations) — this metric represents observed anchor elements, not
//   unique destination URLs.
function extractLinkCounts($: ReturnType<typeof load>, finalUrl: string): LinkCounts {
  const baseHostname = new URL(finalUrl).hostname.toLowerCase();
  let internalLinkCount = 0;
  let externalLinkCount = 0;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const trimmed = href.trim();
    if (trimmed.length === 0) return;
    if (trimmed.startsWith("#")) return;

    const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)?.[1]?.toLowerCase();
    if (scheme === "mailto" || scheme === "tel" || scheme === "javascript") return;

    let resolved: URL;
    try {
      resolved = new URL(trimmed, finalUrl);
    } catch {
      return;
    }

    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;

    if (resolved.hostname.toLowerCase() === baseHostname) {
      internalLinkCount++;
    } else {
      externalLinkCount++;
    }
  });

  return { internalLinkCount, externalLinkCount };
}

interface ImageFacts {
  imageCount: number;
  imagesMissingAltCount: number;
}

// "Missing alt" = the alt ATTRIBUTE is absent entirely, distinct from
// alt="" (present but empty, which per standard accessibility/SEO guidance
// is a valid way to mark an image as intentionally decorative and must not
// be flagged the same as a genuinely missing attribute).
function extractImageFacts($: ReturnType<typeof load>): ImageFacts {
  const images = $("img");
  let imagesMissingAltCount = 0;

  images.each((_, el) => {
    if ($(el).attr("alt") === undefined) {
      imagesMissingAltCount++;
    }
  });

  return { imageCount: images.length, imagesMissingAltCount };
}

// Word count excludes script/style/noscript/template content (never
// executed or rendered) and normalizes whitespace before splitting on word
// boundaries. This counts tokens present in the static HTML response only —
// it is NOT equal to rendered-browser visible text (CSS-hidden content,
// JS-injected content, and JS-removed content are all indistinguishable from
// normal text at this layer, per Stage 14.3's documented static-HTML-only
// limitation).
function extractWordCount(html: string): number {
  const $$ = load(html);
  $$("script, style, noscript, template").remove();
  const text = $$("body").length > 0 ? $$("body").text() : $$.root().text();
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) return 0;
  return normalized.split(" ").length;
}

// Recognizes @type as a string or array of strings on the node itself, and
// recurses into @graph arrays and into top-level arrays of JSON-LD nodes —
// covers every form listed in Stage 14.3 §17. Deliberately does NOT recurse
// into arbitrary nested properties (e.g. a "author": {"@type": "Person"}
// sub-object) beyond @graph — only top-level nodes and @graph members are
// inspected, keeping type collection scoped and deterministic rather than
// an open-ended deep walk.
function collectTypes(node: unknown, seen: Set<string>, ordered: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, seen, ordered);
    return;
  }
  if (typeof node !== "object" || node === null) return;

  const obj = node as Record<string, unknown>;
  const type = obj["@type"];

  if (typeof type === "string") {
    if (!seen.has(type)) {
      seen.add(type);
      ordered.push(type);
    }
  } else if (Array.isArray(type)) {
    for (const t of type) {
      if (typeof t === "string" && !seen.has(t)) {
        seen.add(t);
        ordered.push(t);
      }
    }
  }

  if (Array.isArray(obj["@graph"])) {
    collectTypes(obj["@graph"], seen, ordered);
  }
}

function extractStructuredData($: ReturnType<typeof load>): SeoStructuredData {
  const seen = new Set<string>();
  const ordered: string[] = [];
  let jsonLdCount = 0;
  let invalidCount = 0;

  $("script").each((_, el) => {
    const typeAttr = $(el).attr("type");
    if (typeof typeAttr !== "string" || typeAttr.toLowerCase() !== "application/ld+json") {
      return;
    }

    jsonLdCount++;
    const raw = $(el).html() ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      // Malformed JSON-LD must never fail the whole parse — just tally it.
      invalidCount++;
      return;
    }

    collectTypes(parsed, seen, ordered);
  });

  return { jsonLdCount, types: ordered, invalidCount };
}

export function parseSeoHtml(html: string, finalUrl: string): ParsedSeoPage {
  const $ = load(html);
  const headings = extractHeadings($);
  const linkCounts = extractLinkCounts($, finalUrl);
  const imageFacts = extractImageFacts($);

  return {
    title: extractTitle($),
    metaDescription: extractMetaDescription($),
    ...headings,
    canonicalUrl: extractCanonicalUrl($),
    robotsMeta: extractRobotsMeta($),
    ...linkCounts,
    ...imageFacts,
    wordCount: extractWordCount(html),
    structuredData: extractStructuredData($),
  };
}
