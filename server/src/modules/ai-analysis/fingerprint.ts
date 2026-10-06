import { createHash } from "node:crypto";
import type { PerformanceAiInput, PerformanceAiMetricSnapshot } from "./types";

// Stage 16.1: a deterministic fingerprint of a PerformanceAiInput, so an
// unchanged input can be recognized as unchanged (Stage 16.2's dedup
// lookup) without comparing full objects. Deliberately a pure function of
// MEASURED input only -- provider/model are never mixed in here (they live
// on the AiAnalysis row itself, added at persistence time, not on this
// type at all), so the same metrics always fingerprint identically
// regardless of which provider/model will eventually analyze them.
//
// Every nested object below is rebuilt with an explicit, fixed key order
// rather than spread/passed through as-is -- this is what actually
// guarantees "field ordering must not accidentally change the fingerprint"
// (Stage 16.1 §9), since JSON.stringify serializes object keys in
// declaration order, not sorted order, for plain string keys.

function canonicalizeSnapshot(snapshot: PerformanceAiMetricSnapshot | null): unknown {
  if (snapshot === null) return null;

  return {
    performanceScore: snapshot.performanceScore,
    lab: {
      lcpMs: snapshot.lab.lcpMs,
      cls: snapshot.lab.cls,
      fcpMs: snapshot.lab.fcpMs,
      tbtMs: snapshot.lab.tbtMs,
    },
    field: {
      lcpMs: snapshot.field.lcpMs,
      cls: snapshot.field.cls,
      inpMs: snapshot.field.inpMs,
      ttfbMs: snapshot.field.ttfbMs,
    },
    ratings: {
      performanceScore: snapshot.ratings.performanceScore,
      labLcpMs: snapshot.ratings.labLcpMs,
      labCls: snapshot.ratings.labCls,
      labFcpMs: snapshot.ratings.labFcpMs,
      labTbtMs: snapshot.ratings.labTbtMs,
      fieldLcpMs: snapshot.ratings.fieldLcpMs,
      fieldCls: snapshot.ratings.fieldCls,
      fieldInpMs: snapshot.ratings.fieldInpMs,
      fieldTtfbMs: snapshot.ratings.fieldTtfbMs,
      coreWebVitals: snapshot.ratings.coreWebVitals,
    },
  };
}

function canonicalizeTrend(trend: PerformanceAiInput["trend"]): unknown {
  return {
    performanceScore: trend.performanceScore,
    labLcpMs: trend.labLcpMs,
    labCls: trend.labCls,
    labFcpMs: trend.labFcpMs,
    labTbtMs: trend.labTbtMs,
    fieldLcpMs: trend.fieldLcpMs,
    fieldCls: trend.fieldCls,
    fieldInpMs: trend.fieldInpMs,
    fieldTtfbMs: trend.fieldTtfbMs,
  };
}

// sha256 (node:crypto, a Node built-in -- no hashing dependency installed)
// of a canonical JSON serialization. Hex-encoded for direct storage in the
// AiAnalysis.inputFingerprint text column.
export function computePerformanceAiInputFingerprint(input: PerformanceAiInput): string {
  const canonical = {
    pageUrl: input.pageUrl,
    strategy: input.strategy,
    current: canonicalizeSnapshot(input.current),
    previous: canonicalizeSnapshot(input.previous),
    trend: canonicalizeTrend(input.trend),
  };

  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
