import type { PerformanceMetricValues, PerformanceRatings } from "../types";
import { formatCls, formatMs } from "../utils";
import { PerformanceMetricCard } from "./PerformanceMetricCard";

interface LabMetricsProps {
  metrics: PerformanceMetricValues;
  ratings: PerformanceRatings;
}

export function LabMetrics({ metrics, ratings }: LabMetricsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-muted-foreground">
          Lab Data
        </h3>
        <p className="text-xs text-muted-foreground">
          Synthetic Lighthouse results from a simulated device and network.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PerformanceMetricCard
          label="LCP"
          value={metrics.labLcpMs !== null ? formatMs(metrics.labLcpMs) : null}
          unavailableText="Unavailable"
          rating={ratings.labLcpMs}
        />
        <PerformanceMetricCard
          label="CLS"
          value={metrics.labCls !== null ? formatCls(metrics.labCls) : null}
          unavailableText="Unavailable"
          rating={ratings.labCls}
        />
        <PerformanceMetricCard
          label="FCP"
          value={metrics.labFcpMs !== null ? formatMs(metrics.labFcpMs) : null}
          unavailableText="Unavailable"
          rating={ratings.labFcpMs}
        />
        <PerformanceMetricCard
          label="TBT"
          value={metrics.labTbtMs !== null ? formatMs(metrics.labTbtMs) : null}
          unavailableText="Unavailable"
          rating={ratings.labTbtMs}
          ratingLabelOverride="Not rated"
        />
      </div>
    </div>
  );
}
