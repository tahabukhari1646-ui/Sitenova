import { RATING_ORDER } from "./alerts";
import type { PerformanceRating } from "./ratings";

// Stage 16.5: pure decision logic for "does this transition qualify for
// automatic AI enrichment" -- no Prisma, no HTTP, no AI/provider code, no
// randomness. Mirrors performance/alerts.ts's derivePerformanceAlert exact
// semantics and shares its RATING_ORDER constant rather than redefining a
// second degradation concept (Stage 16.5 §2/§3) -- this file classifies
// the SAME coreWebVitals transition derivePerformanceAlert already
// classifies for Alert purposes; it is a second, independent CONSUMER of
// that one canonical ordering, never a competing definition of it.
//
// The only input is the already-derived Stage 13.5 `coreWebVitals` rating
// (rateCoreWebVitals) for the previous and current check -- no LCP/CLS/
// INP/FCP/TBT/TTFB/performanceScore value or threshold is read or
// duplicated here.

export interface PerformanceDegradationTransition {
  previousState: PerformanceRating | null;
  currentState: PerformanceRating;
  // true only for a genuine NEW entry into a degraded tier -- never true
  // for an unchanged rating, a baseline (no previous check), any
  // transition touching UNKNOWN on either side, or a recovery-direction
  // transition (e.g. POOR -> NEEDS_IMPROVEMENT).
  enteredDegraded: boolean;
}

export function derivePerformanceDegradationTransition(
  previousRating: PerformanceRating | null,
  currentRating: PerformanceRating
): PerformanceDegradationTransition {
  const base = { previousState: previousRating, currentState: currentRating };

  // Baseline: no previous comparable check exists yet. The first
  // PerformanceCheck for a given (website, pageUrl, strategy) must never
  // automatically trigger AI -- there is nothing to have "entered"
  // degradation FROM (Stage 16.5 §4).
  if (previousRating === null) return { ...base, enteredDegraded: false };

  // Conservative UNKNOWN handling (Stage 16.5 §15): missing/insufficient
  // CrUX field data is common and legitimate, never a signal to spend a
  // paid AI call on. UNKNOWN on EITHER side (previous or current) means
  // this transition is never treated as "entered degraded" -- covers
  // UNKNOWN -> POOR, GOOD -> UNKNOWN, and UNKNOWN -> GOOD identically, all
  // conservatively false.
  if (previousRating === "UNKNOWN" || currentRating === "UNKNOWN") {
    return { ...base, enteredDegraded: false };
  }

  if (previousRating === currentRating) return { ...base, enteredDegraded: false };

  const isDegradation = RATING_ORDER[currentRating] > RATING_ORDER[previousRating];
  if (!isDegradation) return { ...base, enteredDegraded: false };

  // isDegradation being true already implies currentRating is
  // NEEDS_IMPROVEMENT or POOR (the only ratings with a RATING_ORDER
  // greater than GOOD) -- this check is redundant by construction but
  // kept explicit (matching alerts.ts's own "fail safe, never an unsafe
  // assertion" discipline) rather than trusted implicitly.
  const enteredDegraded = currentRating === "NEEDS_IMPROVEMENT" || currentRating === "POOR";
  return { ...base, enteredDegraded };
}
