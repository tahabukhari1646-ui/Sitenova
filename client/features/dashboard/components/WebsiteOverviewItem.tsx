import Link from "next/link";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card } from "@/components/ui/card";
import {
  UPTIME_STATUS_BADGE,
  formatExactTime,
  formatLastChecked,
  getUptimeStatus,
} from "@/features/monitoring/utils";
import type { MonitoringCheck, Website } from "@/types";

interface WebsiteOverviewItemProps {
  website: Website;
  check: MonitoringCheck | null;
  isStatusLoading: boolean;
}

export function WebsiteOverviewItem({
  website,
  check,
  isStatusLoading,
}: WebsiteOverviewItemProps) {
  const uptimeStatus = getUptimeStatus(check);

  return (
    <Link href={`/websites/${website.id}`} className="block">
      <Card className="gap-2 p-4 transition-colors hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">
              {website.name || website.url}
            </span>
            {isStatusLoading ? (
              <span className="text-xs text-muted-foreground">
                Checking...
              </span>
            ) : (
              <StatusBadge status={UPTIME_STATUS_BADGE[uptimeStatus]} />
            )}
            <span className="text-xs text-muted-foreground">
              {website.isActive ? "Active" : "Paused"}
            </span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {website.url}
          </p>
        </div>
        <p
          className="shrink-0 text-xs text-muted-foreground"
          title={isStatusLoading ? undefined : formatExactTime(check)}
        >
          {isStatusLoading ? "Checking..." : formatLastChecked(check)}
        </p>
      </Card>
    </Link>
  );
}
