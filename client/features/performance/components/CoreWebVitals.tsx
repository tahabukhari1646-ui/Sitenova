import { StatusBadge } from "@/components/shared/StatusBadge";
import type { PerformanceRating } from "../types";
import {
  RATING_BADGE_STATUS,
  RATING_LABEL,
  formatCls,
  formatMs,
} from "../utils";
import { PerformanceMetricCard } from "./PerformanceMetricCard";

interface CoreWebVitalsProps {
  fieldLcpMs: number | null;
  fieldInpMs: number | null;
  fieldCls: number | null;
  lcpRating: PerformanceRating;
  inpRating: PerformanceRating;
  clsRating: PerformanceRating;
  overallRating: PerformanceRating;
}

export function CoreWebVitals({
  fieldLcpMs,
  fieldInpMs,
  fieldCls,
  lcpRating,
  inpRating,
  clsRating,
  overallRating,
}: CoreWebVitalsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-muted-foreground">
            Core Web Vitals
          </h3>
          <p className="text-xs text-muted-foreground">
            Sentinel AI&apos;s derived summary from real-user field data —
            not Google&apos;s official CrUX pass/fail result.
          </p>
        </div>
        <StatusBadge
          status={RATING_BADGE_STATUS[overallRating]}
          label={RATING_LABEL[overallRating]}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PerformanceMetricCard
          label="LCP"
          value={fieldLcpMs !== null ? formatMs(fieldLcpMs) : null}
          unavailableText="No field data"
          rating={lcpRating}
        />
        <PerformanceMetricCard
          label="INP"
          value={fieldInpMs !== null ? formatMs(fieldInpMs) : null}
          unavailableText="No field data"
          rating={inpRating}
        />
        <PerformanceMetricCard
          label="CLS"
          value={fieldCls !== null ? formatCls(fieldCls) : null}
          unavailableText="No field data"
          rating={clsRating}
        />
      </div>
    </div>
  );
}
