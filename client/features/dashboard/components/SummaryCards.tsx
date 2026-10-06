import { Activity, CheckCircle2, Globe, XCircle } from "lucide-react";

import { StatCard } from "@/components/shared/StatCard";
import { cn } from "@/lib/utils";

interface SummaryCardsProps {
  total: number;
  active: number;
  up: number;
  down: number;
  isStatusLoading: boolean;
}

function SummaryValue({
  icon: Icon,
  iconClassName,
  children,
}: {
  icon: typeof Globe;
  iconClassName?: string;
  children: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("size-4 shrink-0", iconClassName)} />
      <p className="text-2xl font-semibold">{children}</p>
    </div>
  );
}

export function SummaryCards({
  total,
  active,
  up,
  down,
  isStatusLoading,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Total websites"
        value={
          <SummaryValue icon={Globe} iconClassName="text-muted-foreground">
            {String(total)}
          </SummaryValue>
        }
      />
      <StatCard
        label="Active"
        value={
          <SummaryValue icon={Activity} iconClassName="text-muted-foreground">
            {String(active)}
          </SummaryValue>
        }
      />
      <StatCard
        label="Up"
        value={
          <SummaryValue icon={CheckCircle2} iconClassName="text-success">
            {isStatusLoading ? "—" : String(up)}
          </SummaryValue>
        }
      />
      <StatCard
        label="Down"
        value={
          <SummaryValue icon={XCircle} iconClassName="text-destructive">
            {isStatusLoading ? "—" : String(down)}
          </SummaryValue>
        }
      />
    </div>
  );
}
