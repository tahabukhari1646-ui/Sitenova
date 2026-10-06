import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card } from "@/components/ui/card";
import type { SeoIssue } from "../types";
import { SEVERITY_BADGE_STATUS, SEVERITY_LABEL } from "../utils";

interface SeoIssuesProps {
  issues: SeoIssue[];
}

// Renders `issues` in exactly the order the backend returned it — never
// re-sorted or re-ranked here. The backend already guarantees a
// deterministic ERROR -> WARNING -> INFO ordering (Stage 14.4).
export function SeoIssues({ issues }: SeoIssuesProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">Issues</h3>
      {issues.length === 0 ? (
        <EmptyState title="No SEO issues detected by the current checks." />
      ) : (
        <Card className="gap-0 divide-y divide-border p-0">
          {issues.map((issue) => (
            <div key={issue.code} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={SEVERITY_BADGE_STATUS[issue.severity]}
                  label={SEVERITY_LABEL[issue.severity]}
                />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {issue.category}
                </span>
              </div>
              <p className="text-sm break-words">{issue.message}</p>
              <p className="text-xs text-muted-foreground break-words">{issue.recommendation}</p>
              {issue.evidence && (
                <p className="text-xs text-muted-foreground break-words">
                  Evidence: {issue.evidence}
                </p>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
