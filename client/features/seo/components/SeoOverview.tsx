import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card } from "@/components/ui/card";
import type { SeoAnalysisResult, SeoCheckRecord } from "../types";
import {
  INDEXABILITY_BADGE_STATUS,
  INDEXABILITY_LABEL,
  formatFullTimestamp,
} from "../utils";

interface SeoOverviewProps {
  check: SeoCheckRecord;
  analysis: SeoAnalysisResult;
}

export function SeoOverview({ check, analysis }: SeoOverviewProps) {
  const errorCount = analysis.issues.filter((i) => i.severity === "ERROR").length;
  const warningCount = analysis.issues.filter((i) => i.severity === "WARNING").length;
  const infoCount = analysis.issues.filter((i) => i.severity === "INFO").length;

  return (
    <Card className="flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Indexability</span>
          <StatusBadge
            status={INDEXABILITY_BADGE_STATUS[analysis.indexability]}
            label={INDEXABILITY_LABEL[analysis.indexability]}
          />
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Derived from HTTP status and observed robots directives — not a
          guarantee of how Google or any search engine will actually index
          this page.
        </p>
        <p className="text-xs text-muted-foreground">
          Last checked {formatFullTimestamp(check.checkedAt)}
        </p>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-destructive">{errorCount}</span> Errors
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-warning">{warningCount}</span> Warnings
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-semibold text-muted-foreground">{infoCount}</span> Info
        </span>
      </div>
    </Card>
  );
}
