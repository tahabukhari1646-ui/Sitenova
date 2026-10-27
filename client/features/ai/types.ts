// Stage 18.9: the shared AI display contract used by all three AI features
// (Performance, SEO, uptime). Moved here unchanged from
// features/performance/types.ts, which re-exports these names so existing
// imports keep working. Mirrors the backend's FACT / INFERENCE /
// RECOMMENDATION finding shape (server/src/modules/ai-analysis/types.ts).

export type AiAnalysisStatus = "SUCCEEDED" | "FAILED" | "INVALID_RESPONSE";
// Stage 18.9: who created an analysis -- a user's click or the scheduler.
export type AiAnalysisTrigger = "MANUAL" | "AUTOMATIC";
export type AiUrgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AiConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface AiFinding {
  title: string;
  severity: AiUrgency;
  evidence: string[];
  explanation: string;
  confidence: AiConfidence;
  recommendations: string[];
}
