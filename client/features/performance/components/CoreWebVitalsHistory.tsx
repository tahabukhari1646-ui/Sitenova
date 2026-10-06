"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PerformanceHistoryEntry } from "../types";
import { formatCls, formatMs } from "../utils";
import { HistoryLineChart } from "./HistoryLineChart";

type CwvMetricKey = "LCP" | "INP" | "CLS";

const METRIC_OPTIONS: { value: CwvMetricKey; label: string }[] = [
  { value: "LCP", label: "LCP" },
  { value: "INP", label: "INP" },
  { value: "CLS", label: "CLS" },
];

function getMetricValue(
  entry: PerformanceHistoryEntry,
  metric: CwvMetricKey
): number | null {
  if (metric === "LCP") return entry.fieldLcpMs;
  if (metric === "INP") return entry.fieldInpMs;
  return entry.fieldCls;
}

function formatMetricValue(metric: CwvMetricKey, value: number): string {
  return metric === "CLS" ? formatCls(value) : formatMs(value);
}

interface CoreWebVitalsHistoryProps {
  entries: PerformanceHistoryEntry[];
}

// LCP/INP are milliseconds and CLS is unitless — mixing all three into one
// chart would be unreadable, so the user picks one metric at a time
// (default LCP) rather than seeing three incompatible scales at once.
export function CoreWebVitalsHistory({ entries }: CoreWebVitalsHistoryProps) {
  const [metric, setMetric] = useState<CwvMetricKey>("LCP");

  const points = useMemo(
    () =>
      entries.map((entry) => ({
        checkedAt: entry.checkedAt,
        value: getMetricValue(entry, metric),
      })),
    [entries, metric]
  );

  const measuredValues = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null);
  const measuredCount = measuredValues.length;
  // Auto-scaled to the data (with 10% headroom) rather than a fixed domain —
  // unlike performanceScore, LCP/INP/CLS have no natural 0-100 ceiling.
  const yMax = measuredCount > 0 ? Math.max(...measuredValues) * 1.1 : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Core Web Vitals History
        </h3>
        <div
          role="group"
          aria-label="Select Core Web Vitals metric"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1"
        >
          {METRIC_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={metric === option.value ? "default" : "ghost"}
              aria-pressed={metric === option.value}
              onClick={() => setMetric(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
      <Card className="p-4">
        {measuredCount === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No field {metric} data available for this period.
          </p>
        ) : (
          <HistoryLineChart
            points={points}
            yMin={0}
            yMax={yMax}
            formatValue={(value) => formatMetricValue(metric, value)}
            ariaLabel={`Field ${metric} history: ${measuredCount} of ${entries.length} tests have real-user data for this period`}
          />
        )}
      </Card>
    </div>
  );
}
