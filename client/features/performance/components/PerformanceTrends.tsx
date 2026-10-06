import {
  HelpCircleIcon,
  MinusIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import type { PerformanceMetricValues, PerformanceTrend, PerformanceTrendMap } from "../types";
import {
  METRIC_LABEL,
  METRIC_ORDER,
  TREND_LABEL,
  formatSignedChange,
} from "../utils";

const TREND_ICON: Record<PerformanceTrend, LucideIcon> = {
  IMPROVING: TrendingUpIcon,
  REGRESSING: TrendingDownIcon,
  STABLE: MinusIcon,
  UNKNOWN: HelpCircleIcon,
};

// The backend already accounts for higher-is-better vs. lower-is-better
// semantics per metric (server/src/modules/performance/stats.ts) — this is
// purely a rendering color, not a re-derivation of direction.
const TREND_COLOR: Record<PerformanceTrend, string> = {
  IMPROVING: "text-success",
  REGRESSING: "text-destructive",
  STABLE: "text-muted-foreground",
  UNKNOWN: "text-muted-foreground",
};

interface PerformanceTrendsProps {
  trend: PerformanceTrendMap;
  changes: PerformanceMetricValues;
}

export function PerformanceTrends({ trend, changes }: PerformanceTrendsProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Performance Trends
      </h3>
      <Card className="gap-0 divide-y divide-border p-0">
        {METRIC_ORDER.map((key) => {
          const direction = trend[key];
          const Icon = TREND_ICON[direction];
          const changeValue = changes[key];

          return (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="text-sm">{METRIC_LABEL[key]}</span>
              <div className="flex items-center gap-3">
                {changeValue !== null && (
                  <span className="text-xs text-muted-foreground">
                    {formatSignedChange(key, changeValue)}
                  </span>
                )}
                <span
                  className={`flex items-center gap-1 text-xs font-medium ${TREND_COLOR[direction]}`}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {TREND_LABEL[direction]}
                </span>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
