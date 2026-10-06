import { ratePerformanceMetrics } from "../performance/ratings";
import { computePerformanceStats } from "../performance/stats";
import type { PerformanceCheckLike } from "../performance/stats";
import type { PerformanceAiInput, PerformanceAiMetricSnapshot } from "./types";
import type { PerformanceCheck } from "../../generated/prisma/client";

// Stage 16.3: the ONE place a Prisma PerformanceCheck row is translated
// into the narrow, provider-independent PerformanceAiInput contract. This
// is deliberately the only function in the AI layer that ever sees a full
// Prisma PerformanceCheck object -- its OUTPUT (not the check itself) is
// what ever reaches a provider (Stage 16.2's AiProvider.analyzePerformance).
//
// Reuses the EXISTING deterministic engines unchanged:
//   - ratePerformanceMetrics (performance/ratings.ts) for both snapshots'
//     `ratings` -- no threshold is ever recomputed here.
//   - computePerformanceStats (performance/stats.ts) for `trend` -- this
//     function's own trend/changes fields are already a pure pairwise
//     comparison of its input array's [0] vs [1], so passing exactly
//     [selectedCheck, predecessorCheck] (never the website's own overall
//     latest/history) correctly scopes trend to the SPECIFIC check being
//     analyzed, not whatever happens to be newest for this stream today.
//     `averages`/`sampleSize` from the result are intentionally unused --
//     PerformanceAiInput has no such field.

function toSnapshot(check: PerformanceCheckLike): PerformanceAiMetricSnapshot {
  return {
    performanceScore: check.performanceScore,
    lab: {
      lcpMs: check.labLcpMs,
      cls: check.labCls,
      fcpMs: check.labFcpMs,
      tbtMs: check.labTbtMs,
    },
    field: {
      lcpMs: check.fieldLcpMs,
      cls: check.fieldCls,
      inpMs: check.fieldInpMs,
      ttfbMs: check.fieldTtfbMs,
    },
    ratings: ratePerformanceMetrics(check),
  };
}

// `selectedCheck` is the exact PerformanceCheck being analyzed -- never
// assumed to be the website's current overall latest. `predecessorCheck`
// must already be the immediate same-(websiteId, pageUrl, strategy)
// predecessor (performanceRepository.findImmediatePredecessor), or null
// for a genuine baseline -- this function does not look anything up
// itself, it only shapes what it's given.
export function buildPerformanceAiInput(
  selectedCheck: PerformanceCheck,
  predecessorCheck: PerformanceCheck | null
): PerformanceAiInput {
  const checksNewestFirst: PerformanceCheckLike[] = predecessorCheck
    ? [selectedCheck, predecessorCheck]
    : [selectedCheck];

  const stats = computePerformanceStats(selectedCheck.strategy, checksNewestFirst);

  return {
    pageUrl: selectedCheck.pageUrl,
    strategy: selectedCheck.strategy,
    current: toSnapshot(selectedCheck),
    previous: predecessorCheck ? toSnapshot(predecessorCheck) : null,
    trend: stats.trend,
  };
}
