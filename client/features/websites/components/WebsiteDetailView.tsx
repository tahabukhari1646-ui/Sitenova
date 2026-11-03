"use client";

import Link from "next/link";
import { useId, useState, type SubmitEvent } from "react";

import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertsSection } from "@/features/alerts/components/AlertsSection";
import { IncidentList } from "@/features/monitoring/components/IncidentList";
import { ResponseTimeChart } from "@/features/monitoring/components/ResponseTimeChart";
import { TimeRangeSelector } from "@/features/monitoring/components/TimeRangeSelector";
import { UptimeHistoryTimeline } from "@/features/monitoring/components/UptimeHistoryTimeline";
import { UptimeStats, UptimeStatsSkeleton } from "@/features/monitoring/components/UptimeStats";
import {
  useRunUptimeCheck,
  useWebsiteHistory,
  useWebsiteStatus,
} from "@/features/monitoring/hooks";
import { PerformanceSection } from "@/features/performance/components/PerformanceSection";
import { SeoSection } from "@/features/seo/components/SeoSection";
import type { HistoryRange } from "@/features/monitoring/types";
import {
  UPTIME_STATUS_BADGE,
  formatExactTime,
  formatLastChecked,
  getUptimeStatus,
} from "@/features/monitoring/utils";
import { useWebsite } from "../hooks";

interface WebsiteDetailViewProps {
  id: string;
}

export function WebsiteDetailView({ id }: WebsiteDetailViewProps) {
  const { website, isLoading, error } = useWebsite(id);
  const {
    check,
    isLoading: isStatusLoading,
    error: statusError,
  } = useWebsiteStatus(id);
  const uptimeStatus = getUptimeStatus(check);

  const [range, setRange] = useState<HistoryRange>("24h");
  const {
    checks,
    stats,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
    refetch: refetchHistory,
  } = useWebsiteHistory(id, range);
  // Declared with the other hooks, before the loading/error early returns.
  const uptimeCheck = useRunUptimeCheck(id);

  // Stage P2: ONE shared selected-page URL, owned here and passed to both
  // PerformanceSection and SeoSection, so "which page" is answered
  // identically for both modules rather than each maintaining its own
  // input. `null` means "not committed yet / reset to homepage" — resolved
  // against `website.url` below once it's loaded, rather than seeded via an
  // effect, since these hooks must be declared before the loading/error
  // guards below (`website` isn't guaranteed defined at this point yet).
  // `urlInput` is the raw draft text the user is typing; it never drives a
  // fetch by itself. `committedPageUrl` is what both sections actually
  // query, and only changes when the user explicitly submits the form below
  // (Enter or the Load button) — never per-keystroke, and never silently,
  // so a result on screen can never be mistaken for belonging to whatever
  // is currently typed but not yet committed.
  const [urlInput, setUrlInput] = useState<string | null>(null);
  const [committedPageUrl, setCommittedPageUrl] = useState<string | null>(null);
  const urlFieldId = useId();

  if (isLoading) {
    return (
      <PageContainer title="Website detail">
        <LoadingState label="Loading website..." />
      </PageContainer>
    );
  }

  if (error || !website) {
    return (
      <PageContainer title="Website detail">
        <ErrorState
          title="Couldn't load this website"
          description={error ?? "Website not found."}
          action={
            <Link href="/websites" className={buttonVariants({ variant: "outline" })}>
              Back to websites
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const websiteUrl = website.url;
  const effectivePageUrl = committedPageUrl ?? websiteUrl;
  const isHomepage = committedPageUrl === null;

  function commitPageUrl(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = (urlInput ?? websiteUrl).trim();
    if (trimmed.length === 0) return;
    setUrlInput(trimmed);
    setCommittedPageUrl(trimmed);
  }

  return (
    <PageContainer
      title={website.name || website.url}
      description={website.url}
      actions={
        <Link
          href="/websites"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Back to websites
        </Link>
      }
    >
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Uptime Monitoring
          </h2>
          {/* Paused sites are skipped by the scheduler; the manual check is
              disabled here too so it can't open incidents or send alerts for
              a site the user deliberately paused. Frontend-only guard. */}
          <Button
            type="button"
            onClick={() => uptimeCheck.runCheck()}
            disabled={!website.isActive || uptimeCheck.isRunning}
          >
            {!website.isActive
              ? "Monitoring is paused"
              : uptimeCheck.isRunning
                ? "Checking..."
                : "Check uptime now"}
          </Button>
        </div>

        {uptimeCheck.isRunning && (
          <p className="text-xs text-muted-foreground">
            This can take a few seconds — Sentinel AI is contacting the
            website.
          </p>
        )}

        {uptimeCheck.error && (
          <p role="alert" className="text-sm text-destructive">
            {uptimeCheck.error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="Uptime status"
            value={
              isStatusLoading ? (
                <span className="text-muted-foreground">Checking...</span>
              ) : statusError ? (
                <span className="text-destructive">{statusError}</span>
              ) : (
                <StatusBadge status={UPTIME_STATUS_BADGE[uptimeStatus]} />
              )
            }
          />
          <StatCard
            label="Last checked"
            value={isStatusLoading ? "Checking..." : formatLastChecked(check)}
            title={isStatusLoading ? undefined : formatExactTime(check)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Uptime history
          </h3>
          <TimeRangeSelector value={range} onChange={setRange} />
        </div>

        {isHistoryLoading ? (
          <div className="flex flex-col gap-4">
            <UptimeStatsSkeleton />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isHistoryError ? (
          <ErrorState
            title="Unable to load uptime history"
            description={historyError ?? undefined}
            action={
              <Button variant="outline" onClick={() => refetchHistory()}>
                Retry
              </Button>
            }
          />
        ) : checks.length === 0 || !stats ? (
          <EmptyState
            title="No monitoring history yet"
            description="Once the monitoring system completes its first check for this range, historical data will appear here automatically."
          />
        ) : (
          <div className="flex flex-col gap-4">
            <UptimeStats stats={stats} />
            <UptimeHistoryTimeline checks={checks} totalInRange={stats.total} />

            <h3 className="text-sm font-medium text-muted-foreground">
              Response time
            </h3>
            <ResponseTimeChart checks={checks} />
          </div>
        )}
      </section>

      <IncidentList websiteId={id} />

      <section className="mt-8 flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight">Page URL</h2>
        <p className="text-sm text-muted-foreground">
          Choose a specific page to analyze — used by both Performance and
          SEO below.
        </p>
        <form onSubmit={commitPageUrl} className="mt-2 flex flex-col gap-1.5">
          <Label htmlFor={urlFieldId}>Page URL</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={urlFieldId}
              type="url"
              className="max-w-md"
              value={urlInput ?? websiteUrl}
              onChange={(event) => setUrlInput(event.target.value)}
            />
            <Button type="submit" variant="outline">
              Load
            </Button>
            {!isHomepage && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setUrlInput(null);
                  setCommittedPageUrl(null);
                }}
              >
                Reset to homepage
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isHomepage ? "Analyzing the homepage." : `Analyzing: ${effectivePageUrl}`}
          </p>
        </form>
      </section>

      <PerformanceSection websiteId={id} pageUrl={effectivePageUrl} />

      <SeoSection websiteId={id} pageUrl={effectivePageUrl} />

      <AlertsSection websiteId={id} />

      <section className="mt-8 flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Website information
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="Monitoring"
            value={website.isActive ? "Active" : "Paused"}
          />
          <StatCard
            label="Platform"
            value={website.platform || "Not specified"}
          />
          <StatCard
            label="Added"
            value={new Date(website.createdAt).toLocaleString()}
          />
          <StatCard
            label="Last updated"
            value={new Date(website.updatedAt).toLocaleString()}
          />
        </div>
      </section>
    </PageContainer>
  );
}
