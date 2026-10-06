"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWebsiteStatus } from "@/features/monitoring/hooks";
import { UPTIME_STATUS_BADGE, getUptimeStatus } from "@/features/monitoring/utils";
import { ApiError } from "@/lib/api-client";
import type { Website } from "@/types";

interface WebsiteRowProps {
  website: Website;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

export function WebsiteRow({ website, onEdit, onDelete }: WebsiteRowProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { check, isLoading: isStatusLoading } = useWebsiteStatus(website.id);
  const uptimeStatus = getUptimeStatus(check);

  async function handleConfirmDelete() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Failed to delete website."
      );
      setIsDeleting(false);
      return;
    }
    setIsDeleting(false);
    setIsConfirming(false);
  }

  return (
    <Card className="gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/websites/${website.id}`}
            className="truncate font-medium hover:underline"
          >
            {website.name || website.url}
          </Link>
          {isStatusLoading ? (
            <span className="text-xs text-muted-foreground">
              Checking...
            </span>
          ) : (
            <StatusBadge status={UPTIME_STATUS_BADGE[uptimeStatus]} />
          )}
          <span className="text-xs text-muted-foreground">
            {website.isActive ? "Active" : "Paused"}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {website.url}
        </p>
        {website.platform && (
          <p className="text-xs text-muted-foreground">{website.platform}</p>
        )}
        {deleteError && (
          <p role="alert" className="text-sm text-destructive">
            {deleteError}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isConfirming ? (
          <>
            <span className="text-sm text-muted-foreground">
              Delete this website?
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? "Deleting..." : "Confirm"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isDeleting}
              onClick={() => setIsConfirming(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsConfirming(true)}
            >
              Delete
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
