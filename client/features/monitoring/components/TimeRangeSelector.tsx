"use client";

import { Button } from "@/components/ui/button";
import type { HistoryRange } from "../types";

const RANGE_OPTIONS: { value: HistoryRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

interface TimeRangeSelectorProps {
  value: HistoryRange;
  onChange: (range: HistoryRange) => void;
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Select time range"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1"
    >
      {RANGE_OPTIONS.map((option) => (
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
