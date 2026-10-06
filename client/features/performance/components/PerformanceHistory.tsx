"use client";

import { useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePerformanceHistory } from "../hooks";
import type { PerformanceHistoryRange, PerformanceStrategy } from "../types";
import { CoreWebVitalsHistory } from "./CoreWebVitalsHistory";
import { PerformanceHistoryChart } from "./PerformanceHistoryChart";
import { PerformanceHistoryRangeSelector } from "./PerformanceHistoryRangeSelector";
import { RecentPerformanceTests } from "./RecentPerformanceTests";

interface PerformanceHistoryProps {
  websiteId: string;
  strategy: PerformanceStrategy;
  pageUrl: string;
  onRunTest: () => void;
  isRunning: boolean;
}

function PerformanceHistorySkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function PerformanceHistory({
  websiteId,
  strategy,
  pageUrl,
  onRunTest,
  isRunning,
}: PerformanceHistoryProps) {
  const [range, setRange] = useState<PerformanceHistoryRange>("7d");
  const { history, isLoading, isError, error, refetch } = usePerformanceHistory(
    websiteId,
    strategy,
    range,
    pageUrl
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Performance History
          </h2>
          <p className="text-sm text-muted-foreground">
            How {strategy === "MOBILE" ? "mobile" : "desktop"} performance has
            changed over time.
          </p>
        </div>
        <PerformanceHistoryRangeSelector value={range} onChange={setRange} />
      </div>

      {isLoading ? (
        <PerformanceHistorySkeleton />
      ) : isError ? (
        <ErrorState
          title="Unable to load performance history"
          description={error ?? undefined}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : !history || history.checks.length === 0 ? (
        <EmptyState
          title="No performance history for this period"
          description="Run a PageSpeed test, or choose a wider time range, to see history here."
          action={
            <Button onClick={onRunTest} disabled={isRunning}>
              {isRunning ? "Running..." : "Run Performance Test"}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {history.truncated && (
            <p className="text-xs text-muted-foreground">
              Showing the most recent {history.returned} of {history.total}{" "}
              tests in this range.
            </p>
          )}
          <PerformanceHistoryChart entries={history.checks} />
          <CoreWebVitalsHistory entries={history.checks} />
          <RecentPerformanceTests entries={history.checks} />
        </div>
      )}
    </div>
  );
}
