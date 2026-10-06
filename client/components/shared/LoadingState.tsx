import { Loader2Icon } from "lucide-react";

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Loading..." }: LoadingStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Loader2Icon className="size-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
