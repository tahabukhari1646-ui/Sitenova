import type { MonitoringCheck } from "@/types";
import { formatExactTime } from "../utils";

interface UptimeHistoryTimelineProps {
  checks: MonitoringCheck[];
  totalInRange: number;
}

export function UptimeHistoryTimeline({
  checks,
  totalInRange,
}: UptimeHistoryTimelineProps) {
  const chronological = [...checks].reverse();
  const upCount = chronological.filter((check) => check.success).length;
  const downCount = chronological.length - upCount;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Uptime history: ${upCount} up, ${downCount} down, out of ${chronological.length} checks shown`}
        className="flex h-10 w-full items-stretch gap-px overflow-hidden rounded-md"
      >
        {chronological.map((check) => (
          <div
            key={check.id}
            title={`${check.success ? "Up" : "Down"} — ${formatExactTime(check)}`}
            className={`min-w-[2px] flex-1 ${
              check.success ? "bg-success" : "bg-destructive"
            }`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Oldest</span>
        <span>Newest</span>
      </div>
      {totalInRange > checks.length && (
        <p className="text-xs text-muted-foreground">
          Showing the most recent {checks.length} of {totalInRange} checks in
          this range.
        </p>
      )}
    </div>
  );
}
