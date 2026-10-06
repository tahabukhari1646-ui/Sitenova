"use client";

import { Button } from "@/components/ui/button";
import type { PerformanceStrategy } from "../types";

const STRATEGY_OPTIONS: { value: PerformanceStrategy; label: string }[] = [
  { value: "MOBILE", label: "Mobile" },
  { value: "DESKTOP", label: "Desktop" },
];

interface PerformanceStrategySelectorProps {
  value: PerformanceStrategy;
  onChange: (strategy: PerformanceStrategy) => void;
  disabled?: boolean;
}

export function PerformanceStrategySelector({
  value,
  onChange,
  disabled,
}: PerformanceStrategySelectorProps) {
  return (
    <div
      role="group"
      aria-label="Select performance strategy"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1"
    >
      {STRATEGY_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "ghost"}
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
