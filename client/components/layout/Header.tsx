import Link from "next/link";

import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { AccountMenu } from "./AccountMenu";
import { BrandMark } from "./BrandMark";
import { MobileNav } from "./MobileNav";

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border bg-background px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <MobileNav />
        <Link href="/dashboard" className="md:hidden">
          <BrandMark />
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
