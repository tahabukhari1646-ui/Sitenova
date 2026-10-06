import { StatCard } from "@/components/shared/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { HistoryStats } from "../types";
import { formatResponseTime, formatUptimePercentage } from "../utils";

interface UptimeStatsProps {
  stats: HistoryStats;
}

function StatValue({ children }: { children: string }) {
  return <p className="text-lg font-semibold">{children}</p>;
}

export function UptimeStats({ stats }: UptimeStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <StatCard
        label="Uptime"
        value={<StatValue>{formatUptimePercentage(stats.uptimePercentage)}</StatValue>}
      />
      <StatCard label="Checks" value={<StatValue>{String(stats.total)}</StatValue>} />
      <StatCard
        label="Successful"
        value={<StatValue>{String(stats.successful)}</StatValue>}
      />
      <StatCard label="Failed" value={<StatValue>{String(stats.failed)}</StatValue>} />
      <StatCard
        label="Avg response"
        value={<StatValue>{formatResponseTime(stats.averageResponseTimeMs)}</StatValue>}
      />
    </div>
  );
}

export function UptimeStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-xl p-4 ring-1 ring-foreground/10">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-5 w-12" />
        </div>
      ))}
    </div>
  );
}
