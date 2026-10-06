"use client";

import { Button } from "@/components/ui/button";
import type { NotificationStatusFilter } from "../types";

const STATUS_OPTIONS: { value: NotificationStatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UNREAD", label: "Unread" },
  { value: "READ", label: "Read" },
];

interface NotificationFiltersProps {
  value: NotificationStatusFilter;
  onChange: (value: NotificationStatusFilter) => void;
}

// Same button-group toggle pattern as IncidentFilter/TimeRangeSelector/
// AlertFiltersBar -- filtering is entirely server-driven (Stage 15.7 §14),
// each option a real distinct query, never a client-side re-filter of one
// fetched list.
export function NotificationFilters({ value, onChange }: NotificationFiltersProps) {
  return (
    <div
      role="group"
      aria-label="Filter notifications"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1"
    >
      {STATUS_OPTIONS.map((option) => (
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
