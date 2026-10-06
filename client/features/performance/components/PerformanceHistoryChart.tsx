import { Card } from "@/components/ui/card";
import type { PerformanceHistoryEntry } from "../types";
import { formatScore } from "../utils";
import { HistoryLineChart } from "./HistoryLineChart";

interface PerformanceHistoryChartProps {
  entries: PerformanceHistoryEntry[];
}

export function PerformanceHistoryChart({ entries }: PerformanceHistoryChartProps) {
  const points = entries.map((entry) => ({
    checkedAt: entry.checkedAt,
    value: entry.performanceScore,
  }));
  const measuredCount = points.filter((point) => point.value !== null).length;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Performance Score History
      </h3>
      <Card className="p-4">
        <HistoryLineChart
          points={points}
          yMin={0}
          yMax={100}
          formatValue={(value) => formatScore(value)}
          ariaLabel={`Performance score history: ${measuredCount} measurement${
            measuredCount === 1 ? "" : "s"
          } shown, scored 0 to 100`}
        />
      </Card>
    </div>
  );
}
