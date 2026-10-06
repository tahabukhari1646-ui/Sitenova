import type { IncidentAction } from "./incidents";

export type AlertType = "INCIDENT_OPENED" | "INCIDENT_RESOLVED";

export type AlertAction =
  | { type: "none" }
  | { type: "create"; alertType: AlertType };

// Pure decision logic: no Express, Prisma, HTTP, or database dependency.
// Alerts are strictly derived from a confirmed Incident transition — never
// from a raw MonitoringCheck or the derived MonitoringStatus directly — so
// this deliberately takes the already-computed IncidentAction as its only
// input, rather than re-deriving anything from check/status data itself.
export function decideAlertAction(incidentAction: IncidentAction): AlertAction {
  if (incidentAction.type === "create") {
    return { type: "create", alertType: "INCIDENT_OPENED" };
  }

  if (incidentAction.type === "resolve") {
    return { type: "create", alertType: "INCIDENT_RESOLVED" };
  }

  return { type: "none" };
}
