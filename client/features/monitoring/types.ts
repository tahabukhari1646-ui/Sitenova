import type { AiAnalysisStatus, AiAnalysisTrigger, AiFinding, AiUrgency } from "@/features/ai/types";
import type { Incident, MonitoringCheck } from "@/types";

export interface LatestCheckResult {
  check: MonitoringCheck | null;
}

// POST /websites/:id/check -- one on-demand uptime check, saved through the
// same path as the scheduler's. Always a saved row (201), never null.
export interface ManualCheckResult {
  check: MonitoringCheck;
}

export type HistoryRange = "24h" | "7d" | "30d";

export interface HistoryStats {
  total: number;
  successful: number;
  failed: number;
  uptimePercentage: number | null;
  averageResponseTimeMs: number | null;
}

export interface HistoryResult {
  checks: MonitoringCheck[];
  stats: HistoryStats;
}

export interface IncidentsResult {
  incidents: Incident[];
}

// --- Stage 18.6: uptime incident AI diagnosis (consumes the Stage 18.5
// backend verbatim -- see server/src/modules/ai-analysis/service.ts's
// IncidentAiAnalysisResultDto). Same output shape as the SEO diagnosis:
// Performance's finding shape plus `limitations`. `inputFingerprint` is
// omitted: nothing in this UI displays it.

export interface IncidentAiOutput {
  summary: string;
  priority: AiUrgency;
  findings: AiFinding[];
  limitations: string[];
}

export interface IncidentAiAnalysis {
  id: string;
  incidentId: string;
  provider: string;
  model: string;
  status: AiAnalysisStatus;
  output: IncidentAiOutput | null;
  createdAt: string;
  // Stage 18.9: who created it -- a user's click (uptime AI is manual-only
  // in V1, so this is always "MANUAL" today).
  trigger: AiAnalysisTrigger;
}

export interface IncidentAiAnalysisResult {
  analysis: IncidentAiAnalysis;
}

// GET .../ai-analysis/latest -- null when this incident has no stored
// successful diagnosis yet.
export interface IncidentLatestAiAnalysisResult {
  analysis: IncidentAiAnalysis | null;
}
