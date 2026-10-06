"use client";

import { Button } from "@/components/ui/button";
import type { IncidentStatus } from "@/types";

export type IncidentFilterValue = IncidentStatus | "ALL";

const FILTER_OPTIONS: { value: IncidentFilterValue; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
];

interface IncidentFilterProps {
  value: IncidentFilterValue;
  onChange: (value: IncidentFilterValue) => void;
}

export function IncidentFilter({ value, onChange }: IncidentFilterProps) {
  return (
    <div
      role="group"
      aria-label="Filter incidents"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1"
    >
      {FILTER_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
