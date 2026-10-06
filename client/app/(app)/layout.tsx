import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/AppSidebar";
import { Header } from "@/components/layout/Header";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { ThemeServerSync } from "@/features/theme/ThemeServerSync";

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      {/* Stage 16.9: applies the authenticated user's DB-persisted theme
          app-wide as soon as it loads -- mounted once here (inside
          AuthGuard, so only for an authenticated session), not duplicated
          per-page. Renders nothing visible. */}
      <ThemeServerSync />
      <div className="flex flex-1">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
