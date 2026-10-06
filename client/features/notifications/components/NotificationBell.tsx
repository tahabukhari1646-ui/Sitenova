"use client";

import { useState } from "react";
import { BellIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useNotifications } from "../hooks";
import type { NotificationStatusFilter } from "../types";
import { formatUnreadBadge, getBellAccessibleLabel } from "../utils";
import { NotificationPanel } from "./NotificationPanel";

// The global bell/panel entry point for the authenticated app (Stage
// 15.7). Reuses the existing Sheet primitive (base-ui Dialog under the
// hood) rather than the Menu-based DropdownMenu -- a notification panel
// has rich, non-menuitem content (filter buttons, a scrollable list,
// per-row navigation links), which doesn't fit ARIA menu semantics the
// way DropdownMenu's role="menu"/menuitem model expects. Sheet already
// provides real outside-click-closes and Escape-closes behavior for free
// (base-ui Dialog), and its built-in responsive sizing (3/4 width on
// mobile, capped at sm:max-w-sm on larger screens) satisfies both the
// mobile-safe and compact-desktop requirements without extra work.
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<NotificationStatusFilter>("ALL");
  // Mounted for as long as the bell itself is mounted (i.e. always, in the
  // persistent Header) regardless of whether the panel is currently open --
  // this is what keeps the badge polling/updating in the background
  // (Stage 15.7 §11). `unread` is always the true global count no matter
  // which status is selected, so one query instance safely powers both
  // the badge and the panel body without a second dedicated query.
  const { unread } = useNotifications(status);
  const badge = formatUnreadBadge(unread);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon-sm" className="relative rounded-full" />}>
        <BellIcon />
        {badge && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-semibold text-white"
          >
            {badge}
          </span>
        )}
        <span className="sr-only">{getBellAccessibleLabel(unread)}</span>
      </SheetTrigger>
      <SheetContent side="right" className="p-0">
        <NotificationPanel status={status} onStatusChange={setStatus} onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
