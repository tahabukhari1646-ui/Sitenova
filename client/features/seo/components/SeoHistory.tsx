"use client";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { SeoChangeSet } from "../types";
import { useSeoHistory } from "../hooks";
import {
  SEVERITY_BADGE_STATUS,
  SEVERITY_LABEL,
  formatChangeValue,
  formatFullTimestamp,
} from "../utils";

interface SeoHistoryProps {
  websiteId: string;
  pageUrl: string;
}

function SeoHistorySkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

// A change is a FACT, not a verdict — "Title changed" never implies better
// or worse. Only new/resolved issues (below) carry any severity framing,
// and that framing comes entirely from the existing Stage 14.4 issue
// engine, never invented here.
function ChangeSummary({ changes }: { changes: SeoChangeSet }) {
  if (changes.isBaseline) {
    return <p className="text-xs text-muted-foreground">Baseline check — no previous check to compare against.</p>;
  }

  const hasNothing =
    changes.changes.length === 0 &&
    changes.newIssues.length === 0 &&
    changes.resolvedIssues.length === 0;

  if (hasNothing) {
    return <p className="text-xs text-muted-foreground">No tracked SEO changes.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {changes.changes.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {changes.changes.map((change) => (
            <li key={change.code} className="break-words">
              <span className="font-medium text-foreground">{change.label}</span>:{" "}
              {formatChangeValue(change.code, change.previousValue)} →{" "}
              {formatChangeValue(change.code, change.currentValue)}
            </li>
          ))}
        </ul>
      )}

      {(changes.newIssues.length > 0 || changes.resolvedIssues.length > 0) && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-foreground">
            {changes.newIssues.length > 0 && `${changes.newIssues.length} new issue${changes.newIssues.length === 1 ? "" : "s"}`}
            {changes.newIssues.length > 0 && changes.resolvedIssues.length > 0 && " · "}
            {changes.resolvedIssues.length > 0 &&
              `${changes.resolvedIssues.length} issue${changes.resolvedIssues.length === 1 ? "" : "s"} resolved`}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {changes.newIssues.map((issue) => (
              <div key={`new-${issue.code}`} className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                  New
                </span>
                <StatusBadge
                  status={SEVERITY_BADGE_STATUS[issue.severity]}
                  label={SEVERITY_LABEL[issue.severity]}
                />
                <span className="break-words text-muted-foreground">{issue.message}</span>
              </div>
            ))}
            {changes.resolvedIssues.map((issue) => (
              <div key={`resolved-${issue.code}`} className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-success/10 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-success">
                  Resolved
                </span>
                <StatusBadge
                  status={SEVERITY_BADGE_STATUS[issue.severity]}
                  label={SEVERITY_LABEL[issue.severity]}
                />
                <span className="break-words text-muted-foreground">{issue.message}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Raw snapshot facts (unchanged from Stage 14.7) plus, since Stage 14.8, a
// deterministic change summary relative to each row's own true
// chronological predecessor — never a full re-derived issue list per row.
export function SeoHistory({ websiteId, pageUrl }: SeoHistoryProps) {
  const { history, isLoading, isError, error, refetch } = useSeoHistory(websiteId, pageUrl);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">Recent Checks</h3>
      {isLoading ? (
        <SeoHistorySkeleton />
      ) : isError ? (
        <ErrorState
          title="Unable to load SEO history"
          description={error ?? undefined}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : !history || history.checks.length === 0 ? (
        <EmptyState title="No SEO history yet" />
      ) : (
        <div className="flex flex-col gap-3">
          {history.truncated && (
            <p className="text-xs text-muted-foreground">
              Showing the most recent {history.returned} of {history.total} checks.
            </p>
          )}
          <Card className="gap-0 divide-y divide-border p-0">
            {history.checks.map((check) => (
              <div key={check.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">{formatFullTimestamp(check.checkedAt)}</span>
                  <span className="text-xs text-muted-foreground break-words">
                    Status {check.statusCode} ·{" "}
                    {check.title ? `"${check.title}"` : "No title"} · H1{" "}
                    {check.h1Count} · {check.imagesMissingAltCount} missing alt
                  </span>
                </div>
                <ChangeSummary changes={check.changes} />
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
