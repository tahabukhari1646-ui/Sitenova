import type { AiConfidence, AiUrgency } from "./types";

// Stage 18.9: shared AI display helpers, moved here unchanged from
// features/performance/utils.ts (which re-exports them).

// Stage 16.4: mirrors RATING_BADGE_STATUS's exact pattern. Only LOW maps to
// "healthy" (green) and only CRITICAL maps to "critical" (red) -- MEDIUM
// and HIGH both render as "warning" (amber), since StatusBadge has no
// fifth tier and escalating HIGH straight to red would read as more
// alarming than a professional severity presentation calls for (Stage
// 16.4 §13). The text label always shows the real word regardless, so
// meaning is never carried by color alone (§22).
export const URGENCY_BADGE_STATUS: Record<
  AiUrgency,
  "healthy" | "warning" | "critical" | "inactive"
> = {
  LOW: "healthy",
  MEDIUM: "warning",
  HIGH: "warning",
  CRITICAL: "critical",
};

export const URGENCY_LABEL: Record<AiUrgency, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

// Confidence is a different axis from urgency (how sure the AI is, not how
// bad the problem would be) -- deliberately never rendered with the
// healthy/warning/critical palette, since a LOW-confidence finding isn't
// itself a problem the way a POOR rating or CRITICAL priority is.
export const CONFIDENCE_LABEL: Record<AiConfidence, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export function formatAiTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}
