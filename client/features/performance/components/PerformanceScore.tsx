import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { PerformanceRating } from "../types";
import { RATING_BADGE_STATUS, RATING_LABEL, formatScore } from "../utils";

interface PerformanceScoreProps {
  score: number | null;
  rating: PerformanceRating;
}

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const RING_COLOR: Record<PerformanceRating, string> = {
  GOOD: "stroke-success",
  NEEDS_IMPROVEMENT: "stroke-warning",
  POOR: "stroke-destructive",
  UNKNOWN: "stroke-muted-foreground",
};

export function PerformanceScore({ score, rating }: PerformanceScoreProps) {
  const progress =
    score !== null ? Math.max(0, Math.min(100, score)) / 100 : 0;
  const offset = CIRCUMFERENCE * (1 - progress);

  return (
    <Card className="flex-row flex-wrap items-center gap-6 p-6">
      <div className="relative size-28 shrink-0">
        <svg viewBox="0 0 100 100" className="size-28 -rotate-90" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            strokeWidth="10"
            fill="none"
            className="stroke-muted"
          />
          {score !== null && (
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              className={RING_COLOR[rating]}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold" aria-hidden="true">
            {formatScore(score)}
          </span>
        </div>
        <span className="sr-only">
          {score !== null
            ? `Performance score ${Math.round(score)} out of 100, ${RATING_LABEL[rating]}`
            : "Performance score unavailable"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-muted-foreground">
          Performance
        </p>
        <StatusBadge
          status={RATING_BADGE_STATUS[rating]}
          label={RATING_LABEL[rating]}
          className="w-fit"
        />
      </div>
    </Card>
  );
}
