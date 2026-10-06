import { EmptyState } from "@/components/shared/EmptyState";
import type { AlertRecord } from "../types";
import { AlertItem } from "./AlertItem";

interface AlertListProps {
  alerts: AlertRecord[];
  hasActiveFilters: boolean;
}

// Renders `alerts` in exactly the order the backend returned it (createdAt
// DESC, id DESC) — never re-sorted here, per Stage 15.5 §20.
export function AlertList({ alerts, hasActiveFilters }: AlertListProps) {
  if (alerts.length === 0) {
    return hasActiveFilters ? (
      <EmptyState title="No alerts match these filters." />
    ) : (
      <EmptyState
        title="No alerts yet"
        description="Monitoring events detected across uptime, SEO, and performance checks will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} />
      ))}
    </div>
  );
}
