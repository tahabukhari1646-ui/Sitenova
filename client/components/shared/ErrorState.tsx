import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: ErrorStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 py-16 text-center">
      <AlertTriangleIcon className="size-8 text-destructive" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-destructive">{title}</p>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
