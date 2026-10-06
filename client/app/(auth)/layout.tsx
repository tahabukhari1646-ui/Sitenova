import type { ReactNode } from "react";

import { BrandMark } from "@/components/layout/BrandMark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background p-6 text-foreground">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex justify-center">
          <BrandMark />
        </div>
        {children}
      </div>
    </div>
  );
}
