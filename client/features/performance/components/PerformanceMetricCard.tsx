import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { PerformanceRating } from "../types";
import { RATING_BADGE_STATUS, RATING_LABEL } from "../utils";

interface PerformanceMetricCardProps {
  label: string;
  value: string | null;
  unavailableText: string;
  rating: PerformanceRating;
  // Overrides the badge text without changing its color — used for TBT,
  // which is intentionally always rated UNKNOWN (no official threshold
  // exists) but shouldn't read the same as "no data".
  ratingLabelOverride?: string;
}

export function PerformanceMetricCard({
  label,
  value,
  unavailableText,
  rating,
  ratingLabelOverride,
}: PerformanceMetricCardProps) {
  return (
    <Card className="gap-2 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold">{value ?? unavailableText}</p>
      <StatusBadge
        status={RATING_BADGE_STATUS[rating]}
        label={ratingLabelOverride ?? RATING_LABEL[rating]}
        className="w-fit"
      />
    </Card>
  );
}
