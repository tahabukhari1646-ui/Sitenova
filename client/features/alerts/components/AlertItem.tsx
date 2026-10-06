import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card } from "@/components/ui/card";
import type { AlertRecord } from "../types";
import {
  SEVERITY_BADGE_STATUS,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  TYPE_LABEL,
  formatAlertTimestamp,
  getAlertDisplayMessage,
} from "../utils";

interface AlertItemProps {
  alert: AlertRecord;
}

// Deliberately never renders incidentId/seoCheckId/performanceCheckId —
// those are backend traceability fields, not user-facing content (Stage
// 15.5 §13). `code` is shown only as subtle secondary metadata for SEO
// alerts, where it can help distinguish otherwise-similar messages; the
// human-readable message/type label always carries the primary meaning.
export function AlertItem({ alert }: AlertItemProps) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          status={SEVERITY_BADGE_STATUS[alert.severity]}
          label={SEVERITY_LABEL[alert.severity]}
        />
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {SOURCE_LABEL[alert.source]}
        </span>
        <span className="text-sm font-medium">{TYPE_LABEL[alert.type]}</span>
      </div>

      <p className="text-sm break-words text-muted-foreground">
        {getAlertDisplayMessage(alert)}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {alert.code && (
          <span className="text-xs break-all text-muted-foreground">{alert.code}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatAlertTimestamp(alert.createdAt)}
        </span>
      </div>
    </Card>
  );
}
