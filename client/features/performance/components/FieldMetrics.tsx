import type { PerformanceMetricValues, PerformanceRatings } from "../types";
import { formatCls, formatMs } from "../utils";
import { PerformanceMetricCard } from "./PerformanceMetricCard";

interface FieldMetricsProps {
  metrics: PerformanceMetricValues;
  ratings: PerformanceRatings;
}

export function FieldMetrics({ metrics, ratings }: FieldMetricsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-muted-foreground">
          Field Data
        </h3>
        <p className="text-xs text-muted-foreground">
          Real-user Chrome experience data, when enough traffic exists.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PerformanceMetricCard
          label="LCP"
          value={metrics.fieldLcpMs !== null ? formatMs(metrics.fieldLcpMs) : null}
          unavailableText="No field data"
          rating={ratings.fieldLcpMs}
        />
        <PerformanceMetricCard
          label="INP"
          value={metrics.fieldInpMs !== null ? formatMs(metrics.fieldInpMs) : null}
          unavailableText="No field data"
          rating={ratings.fieldInpMs}
        />
        <PerformanceMetricCard
          label="CLS"
          value={metrics.fieldCls !== null ? formatCls(metrics.fieldCls) : null}
          unavailableText="No field data"
          rating={ratings.fieldCls}
        />
        <PerformanceMetricCard
          label="TTFB"
          value={metrics.fieldTtfbMs !== null ? formatMs(metrics.fieldTtfbMs) : null}
          unavailableText="No field data"
          rating={ratings.fieldTtfbMs}
        />
      </div>
    </div>
  );
}
