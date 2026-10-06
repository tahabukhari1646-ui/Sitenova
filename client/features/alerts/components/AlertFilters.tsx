"use client";

import { Button } from "@/components/ui/button";
import type { AlertFilters as AlertFiltersValue, AlertSeverity, AlertSource, AlertType } from "../types";
import { TYPE_LABEL } from "../utils";

const SOURCE_OPTIONS: { value: AlertSource | "ALL"; label: string }[] = [
  { value: "ALL", label: "All sources" },
  { value: "UPTIME", label: "Uptime" },
  { value: "SEO", label: "SEO" },
  { value: "PERFORMANCE", label: "Performance" },
];

const SEVERITY_OPTIONS: { value: AlertSeverity | "ALL"; label: string }[] = [
  { value: "ALL", label: "All severities" },
  { value: "ERROR", label: "Error" },
  { value: "WARNING", label: "Warning" },
  { value: "INFO", label: "Info" },
];

const TYPE_OPTIONS: { value: AlertType | "ALL"; label: string }[] = [
  { value: "ALL", label: "All types" },
  ...(Object.keys(TYPE_LABEL) as AlertType[]).map((type) => ({ value: type, label: TYPE_LABEL[type] })),
];

interface AlertFiltersProps {
  value: AlertFiltersValue;
  onChange: (value: AlertFiltersValue) => void;
}

// Source/severity use the same button-group toggle already established by
// IncidentFilter/TimeRangeSelector (few, short options). Type has 7 options
// (incl. "All"), which would crowd a button-group on small screens, so it
// uses a native <select> instead — no dropdown/Select primitive exists
// anywhere in this codebase, and introducing one for a single filter would
// be a new dependency this stage doesn't need; the native element is
// styled to match the existing Input component's classes for visual
// consistency. Every filter change is sent straight to the backend
// (Stage 15.5 §12) — nothing is re-filtered client-side.
export function AlertFiltersBar({ value, onChange }: AlertFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div
        role="group"
        aria-label="Filter by source"
        className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1"
      >
        {SOURCE_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={(value.source ?? "ALL") === option.value ? "default" : "ghost"}
            aria-pressed={(value.source ?? "ALL") === option.value}
            onClick={() =>
              onChange({ ...value, source: option.value === "ALL" ? undefined : option.value })
            }
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div
        role="group"
        aria-label="Filter by severity"
        className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted p-1"
      >
        {SEVERITY_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={(value.severity ?? "ALL") === option.value ? "default" : "ghost"}
            aria-pressed={(value.severity ?? "ALL") === option.value}
            onClick={() =>
              onChange({ ...value, severity: option.value === "ALL" ? undefined : option.value })
            }
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="alert-type-filter" className="sr-only">
          Filter by type
        </label>
        <select
          id="alert-type-filter"
          value={value.type ?? "ALL"}
          onChange={(event) =>
            onChange({
              ...value,
              type: event.target.value === "ALL" ? undefined : (event.target.value as AlertType),
            })
          }
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
