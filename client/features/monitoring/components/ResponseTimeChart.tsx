import type { MonitoringCheck } from "@/types";

interface ResponseTimeChartProps {
  checks: MonitoringCheck[];
}

const CHART_HEIGHT = 80;

export function ResponseTimeChart({ checks }: ResponseTimeChartProps) {
  const chronological = [...checks].reverse();
  const maxResponseTime = Math.max(
    ...chronological.map((check) => check.responseTimeMs),
    1
  );

  return (
    <div className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={`Response time history, up to ${maxResponseTime} milliseconds`}
        viewBox={`0 0 ${chronological.length} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-20 w-full"
      >
        {chronological.map((check, index) => {
          const barHeight = Math.max(
            (check.responseTimeMs / maxResponseTime) * CHART_HEIGHT,
            1
          );
          return (
            <rect
              key={check.id}
              x={index}
              y={CHART_HEIGHT - barHeight}
              width={0.9}
              height={barHeight}
              className="fill-primary"
            >
              <title>{`${check.responseTimeMs} ms`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0 ms</span>
        <span>{maxResponseTime} ms max</span>
      </div>
    </div>
  );
}
