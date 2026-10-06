import { formatChartTimestamp, formatFullTimestamp } from "../utils";

interface HistoryPoint {
  checkedAt: string;
  value: number | null;
}

interface HistoryLineChartProps {
  points: HistoryPoint[];
  yMin: number;
  yMax: number;
  formatValue: (value: number) => string;
  ariaLabel: string;
}

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 36;
const PADDING_Y = 4;

function scaleX(index: number, count: number): number {
  if (count <= 1) return VIEW_WIDTH / 2;
  return (index / (count - 1)) * VIEW_WIDTH;
}

function scaleY(value: number, min: number, max: number): number {
  if (max === min) return VIEW_HEIGHT / 2;
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = (clamped - min) / (max - min);
  return PADDING_Y + (1 - ratio) * (VIEW_HEIGHT - PADDING_Y * 2);
}

// A lightweight inline-SVG line chart, matching the no-chart-library
// approach already used by monitoring's ResponseTimeChart. Gaps (null
// values) intentionally break the line into separate subpaths rather than
// connecting across them — a null CrUX/lab reading must never look like an
// interpolated measurement.
export function HistoryLineChart({
  points,
  yMin,
  yMax,
  formatValue,
  ariaLabel,
}: HistoryLineChartProps) {
  const segments: string[] = [];
  let inSubpath = false;

  points.forEach((point, index) => {
    if (point.value === null) {
      inSubpath = false;
      return;
    }
    const x = scaleX(index, points.length);
    const y = scaleY(point.value, yMin, yMax);
    segments.push(`${inSubpath ? "L" : "M"} ${x} ${y}`);
    inSubpath = true;
  });

  const pathD = segments.join(" ");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return (
    <div className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
      >
        {pathD && (
          <path
            d={pathD}
            fill="none"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className="stroke-primary"
          />
        )}
        {points.map((point, index) => {
          if (point.value === null) return null;
          const x = scaleX(index, points.length);
          const y = scaleY(point.value, yMin, yMax);
          return (
            <circle key={point.checkedAt} cx={x} cy={y} r="1.6" className="fill-primary">
              <title>{`${formatFullTimestamp(point.checkedAt)}: ${formatValue(point.value)}`}</title>
            </circle>
          );
        })}
      </svg>
      {firstPoint && lastPoint && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatChartTimestamp(firstPoint.checkedAt)}</span>
          <span>{formatChartTimestamp(lastPoint.checkedAt)}</span>
        </div>
      )}
    </div>
  );
}
