"use client";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import {
  usePerformanceLatestCheck,
  usePerformanceStats,
  useRunPerformanceCheck,
} from "../hooks";
import type { PerformanceStrategy } from "../types";
import { CoreWebVitals } from "./CoreWebVitals";
import { FieldMetrics } from "./FieldMetrics";
import { LabMetrics } from "./LabMetrics";
import { PerformanceAiAnalysisCard } from "./PerformanceAiAnalysisCard";
import { PerformanceHistory } from "./PerformanceHistory";
import { PerformanceScore } from "./PerformanceScore";
import { PerformanceStrategySelector } from "./PerformanceStrategySelector";
import { PerformanceTrends } from "./PerformanceTrends";

interface PerformanceSectionProps {
  websiteId: string;
  // Stage P2: the currently selected page URL, owned by a shared selector
  // above both PerformanceSection and SeoSection (see WebsiteDetailView.tsx)
  // — Performance no longer maintains its own URL input/commit state.
  pageUrl: string;
}

function PerformanceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-36 w-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

export function PerformanceSection({ websiteId, pageUrl }: PerformanceSectionProps) {
  const [strategy, setStrategy] = useState<PerformanceStrategy>("MOBILE");

  const { stats, isLoading, isError, error, refetch } = usePerformanceStats(
    websiteId,
    strategy,
    pageUrl
  );
  const { runCheck, isRunning, error: runError } =
    useRunPerformanceCheck(websiteId);
  // Stage 16.4: the only source of a real PerformanceCheck id for the
  // selected strategy+pageUrl -- null while loading/erroring/absent, which
  // PerformanceAiAnalysisCard treats identically (disabled Analyze button).
  const { check: latestCheck } = usePerformanceLatestCheck(websiteId, strategy, pageUrl);

  const strategyLabel = strategy === "MOBILE" ? "Mobile" : "Desktop";
  const latest = stats && stats.sampleSize > 0 ? stats.latest : null;

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Performance
          </h2>
          <p className="text-sm text-muted-foreground">
            PageSpeed Insights results for the selected page.
          </p>
        </div>
        <PerformanceStrategySelector
          value={strategy}
          onChange={setStrategy}
          disabled={isRunning}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => runCheck(strategy, pageUrl)}
          disabled={isRunning}
        >
          {isRunning ? `Running ${strategyLabel} test...` : `Run ${strategyLabel} Test`}
        </Button>
        {isRunning && (
          <p className="text-xs text-muted-foreground">
            This can take up to a minute — Sentinel AI is measuring real page
            load performance.
          </p>
        )}
      </div>
      {runError && (
        <p role="alert" className="text-sm text-destructive">
          {runError}
        </p>
      )}

      {isLoading ? (
        <PerformanceSkeleton />
      ) : isError ? (
        <ErrorState
          title="Unable to load performance data"
          description={error ?? undefined}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : !latest || !stats ? (
        <EmptyState
          title="No performance tests yet"
          description={`Run a PageSpeed test to measure this page's ${strategyLabel.toLowerCase()} performance.`}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <PerformanceScore
            score={latest.performanceScore}
            rating={stats.ratings.performanceScore}
          />
          <CoreWebVitals
            fieldLcpMs={latest.fieldLcpMs}
            fieldInpMs={latest.fieldInpMs}
            fieldCls={latest.fieldCls}
            lcpRating={stats.ratings.fieldLcpMs}
            inpRating={stats.ratings.fieldInpMs}
            clsRating={stats.ratings.fieldCls}
            overallRating={stats.ratings.coreWebVitals}
          />
          <LabMetrics metrics={latest} ratings={stats.ratings} />
          <FieldMetrics metrics={latest} ratings={stats.ratings} />
          <PerformanceTrends trend={stats.trend} changes={stats.changes} />
          <PerformanceAiAnalysisCard
            websiteId={websiteId}
            performanceCheckId={latestCheck?.id ?? null}
          />
          <PerformanceHistory
            websiteId={websiteId}
            strategy={strategy}
            pageUrl={pageUrl}
            onRunTest={() => runCheck(strategy, pageUrl)}
            isRunning={isRunning}
          />
        </div>
      )}
    </section>
  );
}
