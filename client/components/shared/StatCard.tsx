import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: ReactNode;
  title?: string;
}

export function StatCard({ label, value, title }: StatCardProps) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 text-sm" title={title}>
        {value}
      </div>
    </Card>
  );
}
