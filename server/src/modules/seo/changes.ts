import { analyzeSeoIssues } from "./issues";
import type {
  DiscoveryResult,
  SeoChange,
  SeoChangeSet,
  SeoIssue,
  SeoPageObservation,
  SeoStructuredData,
} from "./types";

// Pure and side-effect-free by design (mirrors issues.ts's own discipline):
// no Prisma, no network, no Express, no AI, no internally-generated
// timestamps. The same (previous, current) pair always produces the same
// SeoChangeSet. Every entry is pushed in a fixed, hardcoded call order
// below (never derived from object/Set iteration order), so the resulting
// `changes` array is deterministic by construction — no separate sort step
// is needed or added.
//
// IMPORTANT DISTINCTION (Stage 14.8 §5): a change is a FACT, not a verdict.
// "Title changed" does not mean better or worse — that judgment, if any,
// comes only from analyzeSeoIssues (Stage 14.4), never invented here.

function changedIfDifferent<T extends string | number | boolean | null>(
  code: string,
  category: SeoChange["category"],
  label: string,
  previousValue: T,
  currentValue: T
): SeoChange | null {
  if (previousValue === currentValue) return null;
  return { code, category, label, previousValue, currentValue };
}

function compareH1(previous: SeoPageObservation, current: SeoPageObservation): SeoChange[] {
  const changes: SeoChange[] = [];

  const countChange = changedIfDifferent(
    "H1_COUNT_CHANGED",
    "HEADINGS",
    "H1 count",
    previous.h1Count,
    current.h1Count
  );
  if (countChange) changes.push(countChange);

  // Only report a text change when the count itself stayed the same — if
  // the count changed too, that already communicates the meaningful shift
  // (e.g. 1 H1 -> 0 H1 naturally means the old H1 text is gone; reporting
  // "text also changed" on top would be redundant noise).
  if (previous.h1Count === current.h1Count) {
    const textChange = changedIfDifferent(
      "H1_TEXT_CHANGED",
      "HEADINGS",
      "Primary H1",
      previous.h1Text,
      current.h1Text
    );
    if (textChange) changes.push(textChange);
  }

  return changes;
}

function compareDiscovery(
  previous: DiscoveryResult,
  current: DiscoveryResult,
  kind: "robots.txt" | "sitemap"
): SeoChange | null {
  // Compared at the three-state DiscoveryStatus level (FOUND/NOT_FOUND/
  // UNKNOWN), never the persisted true/false/null form — UNKNOWN can never
  // be silently treated as equivalent to false here.
  return changedIfDifferent(
    kind === "robots.txt" ? "ROBOTS_TXT_STATUS_CHANGED" : "SITEMAP_STATUS_CHANGED",
    "DISCOVERY",
    kind === "robots.txt" ? "robots.txt status" : "Sitemap status",
    previous.status,
    current.status
  );
}

// Types are compared and displayed as a SORTED SET, not an ordered list —
// ["Organization","WebSite"] vs ["WebSite","Organization"] must never be
// reported as a change solely because array order differs.
function compareStructuredData(
  previous: SeoStructuredData,
  current: SeoStructuredData
): SeoChange[] {
  const changes: SeoChange[] = [];

  const countChange = changedIfDifferent(
    "JSON_LD_COUNT_CHANGED",
    "STRUCTURED_DATA",
    "JSON-LD blocks",
    previous.jsonLdCount,
    current.jsonLdCount
  );
  if (countChange) changes.push(countChange);

  const invalidChange = changedIfDifferent(
    "JSON_LD_INVALID_COUNT_CHANGED",
    "STRUCTURED_DATA",
    "Invalid JSON-LD blocks",
    previous.invalidCount,
    current.invalidCount
  );
  if (invalidChange) changes.push(invalidChange);

  const previousTypes = [...new Set(previous.types)].sort();
  const currentTypes = [...new Set(current.types)].sort();
  const sameTypeSet =
    previousTypes.length === currentTypes.length &&
    previousTypes.every((t, i) => t === currentTypes[i]);

  if (!sameTypeSet) {
    changes.push({
      code: "STRUCTURED_DATA_TYPES_CHANGED",
      category: "STRUCTURED_DATA",
      label: "Detected structured-data types",
      previousValue: previousTypes.length > 0 ? previousTypes.join(", ") : null,
      currentValue: currentTypes.length > 0 ? currentTypes.join(", ") : null,
    });
  }

  return changes;
}

// code is the sole stable identity for matching issues across snapshots —
// message/severity/category are never compared for identity, only used as
// display context on whichever side (current for new, previous for
// resolved) is semantically correct.
function deriveIssueDelta(
  previousIssues: SeoIssue[],
  currentIssues: SeoIssue[]
): { newIssues: SeoIssue[]; resolvedIssues: SeoIssue[] } {
  const previousCodes = new Set(previousIssues.map((i) => i.code));
  const currentCodes = new Set(currentIssues.map((i) => i.code));

  return {
    newIssues: currentIssues.filter((i) => !previousCodes.has(i.code)),
    resolvedIssues: previousIssues.filter((i) => !currentCodes.has(i.code)),
  };
}

export function deriveSeoChanges(
  previous: SeoPageObservation | null,
  current: SeoPageObservation
): SeoChangeSet {
  if (previous === null) {
    return { isBaseline: true, changes: [], newIssues: [], resolvedIssues: [] };
  }

  const changes: SeoChange[] = [];
  const push = (change: SeoChange | null) => {
    if (change) changes.push(change);
  };

  push(
    changedIfDifferent(
      "STATUS_CODE_CHANGED",
      "STATUS",
      "HTTP status",
      previous.statusCode,
      current.statusCode
    )
  );
  push(changedIfDifferent("TITLE_CHANGED", "METADATA", "Title", previous.title, current.title));
  push(
    changedIfDifferent(
      "META_DESCRIPTION_CHANGED",
      "METADATA",
      "Meta description",
      previous.metaDescription,
      current.metaDescription
    )
  );
  changes.push(...compareH1(previous, current));
  push(
    changedIfDifferent(
      "CANONICAL_CHANGED",
      "METADATA",
      "Canonical URL",
      previous.canonicalUrl,
      current.canonicalUrl
    )
  );
  push(
    changedIfDifferent(
      "ROBOTS_META_CHANGED",
      "INDEXABILITY",
      "Meta robots",
      previous.robotsMeta,
      current.robotsMeta
    )
  );
  push(
    changedIfDifferent(
      "X_ROBOTS_TAG_CHANGED",
      "INDEXABILITY",
      "X-Robots-Tag",
      previous.xRobotsTag,
      current.xRobotsTag
    )
  );
  push(compareDiscovery(previous.robotsTxt, current.robotsTxt, "robots.txt"));
  push(compareDiscovery(previous.sitemap, current.sitemap, "sitemap"));
  push(
    changedIfDifferent(
      "IMAGES_MISSING_ALT_CHANGED",
      "IMAGES",
      "Images missing alt attributes",
      previous.imagesMissingAltCount,
      current.imagesMissingAltCount
    )
  );
  changes.push(...compareStructuredData(previous.structuredData, current.structuredData));

  // Reuses the existing Stage 14.4 issue engine unchanged — no indexability
  // or issue-severity logic is re-implemented here.
  const previousAnalysis = analyzeSeoIssues(previous);
  const currentAnalysis = analyzeSeoIssues(current);

  push(
    changedIfDifferent(
      "INDEXABILITY_CHANGED",
      "INDEXABILITY",
      "Derived indexability",
      previousAnalysis.indexability,
      currentAnalysis.indexability
    )
  );

  const { newIssues, resolvedIssues } = deriveIssueDelta(previousAnalysis.issues, currentAnalysis.issues);

  return { isBaseline: false, changes, newIssues, resolvedIssues };
}

// Deliberately deferred for V1 (not implemented, see Stage 14.8 report):
// - internalLinkCount / externalLinkCount changes — normal content edits
//   (nav tweaks, new posts, seasonal banners) would change these often,
//   with little differentiating SEO signal; same reasoning as word count.
// - wordCount changes — page content edits are frequent and expected;
//   Stage 14.4 already deliberately deferred a thin-content heuristic for
//   the identical reason.
