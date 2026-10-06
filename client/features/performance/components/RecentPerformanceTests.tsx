import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card } from "@/components/ui/card";
import type { PerformanceHistoryEntry } from "../types";
import {
  RATING_BADGE_STATUS,
  RATING_LABEL,
  formatFullTimestamp,
  formatMs,
  formatScore,
} from "../utils";

const MAX_VISIBLE_ENTRIES = 10;

interface RecentPerformanceTestsProps {
  entries: PerformanceHistoryEntry[];
}

export function RecentPerformanceTests({ entries }: RecentPerformanceTestsProps) {
  // `entries` arrives chronological (oldest-first, for the charts above) —
  // this list reads most-recent-first instead.
  const recent = [...entries].reverse().slice(0, MAX_VISIBLE_ENTRIES);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Recent Performance Tests
      </h3>
      <Card className="gap-0 divide-y divide-border p-0">
        {recent.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">{formatFullTimestamp(entry.checkedAt)}</span>
              <span className="text-xs text-muted-foreground">
                {entry.strategy === "MOBILE" ? "Mobile" : "Desktop"} · LCP{" "}
                {entry.fieldLcpMs !== null ? formatMs(entry.fieldLcpMs) : "No field data"}
                {" · "}
                INP{" "}
                {entry.fieldInpMs !== null ? formatMs(entry.fieldInpMs) : "No field data"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {formatScore(entry.performanceScore)}
              </span>
              <StatusBadge
                status={RATING_BADGE_STATUS[entry.ratings.performanceScore]}
                label={RATING_LABEL[entry.ratings.performanceScore]}
              />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
