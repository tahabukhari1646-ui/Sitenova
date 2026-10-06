import { FAILURE_CONFIRMATION_THRESHOLD } from "./status";

export type IncidentAction =
  | { type: "none" }
  | { type: "create"; startedAt: Date }
  | { type: "resolve"; resolvedAt: Date };

export interface DecideIncidentActionInput {
  success: boolean;
  consecutiveFailures: number;
  hasOpenIncident: boolean;
  // First-failure timestamp of the current streak, derived from recent
  // MonitoringCheck history. Only meaningful (and only needed by the
  // caller) when a new incident is about to be created.
  streakStartedAt: Date | null;
  // The just-saved check's own timestamp — used as the incident's
  // resolvedAt on recovery, and as a fallback startedAt if history
  // lookup somehow yields nothing.
  checkedAt: Date;
}

// Pure decision logic: no Express, Prisma, HTTP, or database dependency.
// Reuses status.ts's FAILURE_CONFIRMATION_THRESHOLD as the single source of
// truth for "confirmed DOWN" rather than redefining it here.
export function decideIncidentAction({
  success,
  consecutiveFailures,
  hasOpenIncident,
  streakStartedAt,
  checkedAt,
}: DecideIncidentActionInput): IncidentAction {
  if (success) {
    if (hasOpenIncident) {
      return { type: "resolve", resolvedAt: checkedAt };
    }
    return { type: "none" };
  }

  if (!hasOpenIncident && consecutiveFailures >= FAILURE_CONFIRMATION_THRESHOLD) {
    return { type: "create", startedAt: streakStartedAt ?? checkedAt };
  }

  return { type: "none" };
}
