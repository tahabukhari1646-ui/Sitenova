"use client";

import { useState } from "react";

import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebsiteAlerts } from "../hooks";
import type { AlertFilters } from "../types";
import { AlertFiltersBar } from "./AlertFilters";
import { AlertList } from "./AlertList";

interface AlertsSectionProps {
  websiteId: string;
}

function AlertsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

// Read-only, website-scoped view of the unified Stage 15.4 Alert API. No
// read/unread state, no mark-as-read, no global inbox — those belong to a
// future Notification model. Fails independently: a failed Alert request
// only replaces this section with an ErrorState, never the rest of the
// Website Detail page (each section here already manages its own
// loading/error state, matching Incidents/Performance/SEO).
export function AlertsSection({ websiteId }: AlertsSectionProps) {
  const [filters, setFilters] = useState<AlertFilters>({});
  const { alerts, total, truncated, isLoading, isError, error, refetch } = useWebsiteAlerts(
    websiteId,
    filters
  );
  const hasActiveFilters = Boolean(filters.source || filters.severity || filters.type);

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Alerts</h2>
        <p className="text-sm text-muted-foreground">
          Important monitoring events across uptime, SEO, and performance.
        </p>
      </div>

      <AlertFiltersBar value={filters} onChange={setFilters} />

      {isLoading ? (
        <AlertsSkeleton />
      ) : isError ? (
        <ErrorState
          title="Unable to load alerts"
          description={error ?? undefined}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {truncated
              ? `Showing latest ${alerts.length} of ${total} alerts`
              : `Showing ${alerts.length} alert${alerts.length === 1 ? "" : "s"}`}
          </p>
          <AlertList alerts={alerts} hasActiveFilters={hasActiveFilters} />
        </>
      )}
    </section>
  );
}
