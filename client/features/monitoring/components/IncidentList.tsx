"use client";

import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Incident } from "@/types";
import { useIncidents } from "../hooks";
import {
  INCIDENT_STATUS_BADGE,
  formatDateTime,
  formatDuration,
  getIncidentDurationMs,
} from "../utils";
import { IncidentFilter, type IncidentFilterValue } from "./IncidentFilter";

interface IncidentListProps {
  websiteId: string;
}

function IncidentRow({ incident }: { incident: Incident }) {
  const durationMs = getIncidentDurationMs(incident);

  return (
    <Card className="gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={INCIDENT_STATUS_BADGE[incident.status]}
            label={incident.status === "OPEN" ? "Open" : "Resolved"}
          />
          <span className="text-sm text-muted-foreground">
            Started {formatDateTime(incident.startedAt)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {incident.resolvedAt
            ? `Resolved ${formatDateTime(incident.resolvedAt)}`
            : "Still ongoing"}
        </p>
      </div>
      <p className="shrink-0 text-sm font-medium">
        {durationMs !== null ? formatDuration(durationMs) : "Ongoing"}
      </p>
    </Card>
  );
}

function IncidentListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export function IncidentList({ websiteId }: IncidentListProps) {
  const [filter, setFilter] = useState<IncidentFilterValue>("ALL");

  // Always tracked independently of the selected filter, so the summary at
  // the top stays accurate even when the list below is filtered to
  // "Resolved" (React Query dedupes this against the list query below
  // whenever both share the same key, e.g. filter === "OPEN").
  const openIncidents = useIncidents(websiteId, "OPEN");
  const openCount = openIncidents.incidents.length;

  const list = useIncidents(websiteId, filter === "ALL" ? undefined : filter);

  const emptyMessage =
    filter === "OPEN"
      ? "No active incidents."
      : filter === "RESOLVED"
        ? "No resolved incidents yet."
        : "No incidents have been recorded for this website yet.";

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Incidents</h2>
        <p className="text-sm text-muted-foreground">
          Confirmed outages detected by continuous monitoring.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {openCount > 0 ? (
            <>
              <AlertTriangleIcon className="size-4 shrink-0 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                {openCount} open incident{openCount === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2Icon className="size-4 shrink-0 text-success" />
              <span className="text-sm font-medium text-success">
                No active incidents
              </span>
            </>
          )}
        </div>
        <IncidentFilter value={filter} onChange={setFilter} />
      </div>

      {list.isLoading ? (
        <IncidentListSkeleton />
      ) : list.isError ? (
        <ErrorState
          title="Unable to load incidents"
          description={list.error ?? undefined}
          action={
            <Button variant="outline" onClick={() => list.refetch()}>
              Retry
            </Button>
          }
        />
      ) : list.incidents.length === 0 ? (
        <EmptyState title={emptyMessage} />
      ) : (
        <div className="flex flex-col gap-3">
          {list.incidents.map((incident) => (
            <IncidentRow key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </section>
  );
}
