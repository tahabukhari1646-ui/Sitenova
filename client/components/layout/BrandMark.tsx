import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ShieldCheck className="size-3.5" />
      </span>
      <span className="text-sm font-semibold tracking-tight">Sentinel AI</span>
    </span>
  );
}
