import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      status: {
        healthy: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        critical: "bg-destructive/10 text-destructive",
        inactive: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      status: "inactive",
    },
  }
);

const STATUS_LABEL = {
  healthy: "Up",
  warning: "Warning",
  critical: "Down",
  inactive: "Unknown",
} as const;

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  className?: string;
  // Overrides the default status label — for contexts where the underlying
  // concept isn't website up/down (e.g. an incident's OPEN/RESOLVED state),
  // which shouldn't be worded as if it were monitoring status.
  label?: string;
}

export function StatusBadge({
  status = "inactive",
  className,
  label,
}: StatusBadgeProps) {
  const resolvedStatus = status ?? "inactive";
  return (
    <span className={cn(statusBadgeVariants({ status }), className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {label ?? STATUS_LABEL[resolvedStatus]}
    </span>
  );
}
