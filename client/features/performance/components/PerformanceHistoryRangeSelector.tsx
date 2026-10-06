"use client";

import { Button } from "@/components/ui/button";
import type { PerformanceHistoryRange } from "../types";

const RANGE_OPTIONS: { value: PerformanceHistoryRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

interface PerformanceHistoryRangeSelectorProps {
  value: PerformanceHistoryRange;
  onChange: (range: PerformanceHistoryRange) => void;
}

export function PerformanceHistoryRangeSelector({
  value,
  onChange,
}: PerformanceHistoryRangeSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Select performance history range"
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
