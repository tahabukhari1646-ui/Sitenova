"use client";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunSeoCheck, useSeoLatest } from "../hooks";
import { SeoHistory } from "./SeoHistory";
import { SeoIssues } from "./SeoIssues";
import { SeoMetadata } from "./SeoMetadata";
import { SeoOverview } from "./SeoOverview";
import { SeoTechnicalDetails } from "./SeoTechnicalDetails";

interface SeoSectionProps {
  websiteId: string;
  // Stage P2: the currently selected page URL, owned by a shared selector
  // above both PerformanceSection and SeoSection (see WebsiteDetailView.tsx)
  // — SEO no longer maintains its own URL input.
  pageUrl: string;
}

function SeoSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

export function SeoSection({ websiteId, pageUrl }: SeoSectionProps) {
  const { check, analysis, isLoading, isError, error, refetch } = useSeoLatest(websiteId, pageUrl);
  const { runCheck, isRunning, error: runError } = useRunSeoCheck(websiteId);

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">SEO</h2>
          <p className="text-sm text-muted-foreground">
            Technical and on-page SEO observations for the selected page.
          </p>
        </div>
      </div>

      {/* Stage P2.4: read-only display of the same `pageUrl` prop this
          section already receives from WebsiteDetailView's shared selector —
          not a second URL input/state. Run SEO Check always uses this exact
          displayed value, so the two can never disagree. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Page URL</span>
          <span className="text-sm break-all">{pageUrl}</span>
        </div>
        <Button type="button" onClick={() => runCheck(pageUrl)} disabled={isRunning}>
          {isRunning ? "Running SEO check..." : "Run SEO Check"}
        </Button>
      </div>

      {isRunning && (
        <p className="text-xs text-muted-foreground">
          This can take up to a minute — Sentinel AI is fetching and analyzing
          the page.
        </p>
      )}
      {runError && (
        <p role="alert" className="text-sm text-destructive">
          {runError}
        </p>
      )}

      {isLoading ? (
        <SeoSkeleton />
      ) : isError ? (
        <ErrorState
          title="Unable to load SEO data"
          description={error ?? undefined}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : !check || !analysis ? (
        <EmptyState
          title="No SEO check has been run yet"
          description="Run a check to see title, meta description, headings, indexability, and other on-page SEO observations."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <SeoOverview check={check} analysis={analysis} />
          <SeoIssues issues={analysis.issues} />
          <SeoMetadata check={check} />
          <SeoTechnicalDetails check={check} />
          <SeoHistory websiteId={websiteId} pageUrl={pageUrl} />
        </div>
      )}
    </section>
  );
}
