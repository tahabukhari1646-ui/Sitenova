"use client";

import { useId } from "react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/features/monitoring/utils";
import { useUpdateNotificationSettings } from "../hooks";
import type { EmailDeliveryStatus, LatestEmailDelivery, SettingsNotifications } from "../types";

// Stage 17.6: truthful labels only. SENT means the provider accepted the
// send -- it is never worded as Delivered/Received/Opened. The text label
// is always rendered; badge color is a supplementary cue only.
const DELIVERY_STATUS_DISPLAY: Record<
  EmailDeliveryStatus,
  { label: string; badge: "healthy" | "warning" | "critical" | "inactive" }
> = {
  PENDING: { label: "Waiting to send", badge: "inactive" },
  SENDING: { label: "Sending", badge: "warning" },
  SENT: { label: "Sent", badge: "healthy" },
  FAILED: { label: "Failed", badge: "critical" },
};

// One persisted timestamp per status -- never fabricated.
function getDeliveryTimestamp(latest: LatestEmailDelivery): string {
  switch (latest.status) {
    case "SENT":
      return latest.sentAt ?? latest.createdAt;
    case "FAILED":
      return latest.failedAt ?? latest.createdAt;
    case "SENDING":
      return latest.claimedAt ?? latest.createdAt;
    case "PENDING":
      return latest.createdAt;
  }
}

// Read-only, compact status of the user's most recent email delivery.
// Deliberately no Retry/Resend action and no history (Stage 17.6 scope).
function EmailDeliveryStatusRow({ latest }: { latest: LatestEmailDelivery | null }) {
  return (
    <section
      aria-label="Email delivery status"
      className="flex flex-col gap-1 rounded-md border border-border px-3 py-2"
    >
      <p className="text-xs font-medium text-muted-foreground">Latest email alert</p>
      {latest === null ? (
        <p className="text-sm text-muted-foreground">No email alerts have been processed yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge
              status={DELIVERY_STATUS_DISPLAY[latest.status].badge}
              label={DELIVERY_STATUS_DISPLAY[latest.status].label}
            />
            <time
              dateTime={getDeliveryTimestamp(latest)}
              className="text-xs text-muted-foreground"
            >
              {formatDateTime(getDeliveryTimestamp(latest))}
            </time>
          </div>
          {latest.status === "FAILED" && (
            <p className="text-xs text-muted-foreground">
              Sentinel AI could not send the most recent email alert.
            </p>
          )}
        </>
      )}
    </section>
  );
}

interface NotificationPreferencesProps {
  notifications: SettingsNotifications;
}

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  error: string | null;
  onChange: (checked: boolean) => void;
}

// Same plain styled checkbox convention as WebsiteForm.tsx's "Monitoring
// active" toggle -- no new Switch primitive introduced for this stage.
function ToggleRow({ id, label, description, checked, disabled, error, onChange }: ToggleRowProps) {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={id} className="font-medium">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary disabled:opacity-50"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function NotificationPreferences({ notifications }: NotificationPreferencesProps) {
  const inAppId = useId();
  const emailId = useId();
  // Two fully independent mutation instances -- toggling one preference
  // can never put the other into a pending/error state it didn't cause
  // itself (Stage 16.8 §23/§28).
  const inApp = useUpdateNotificationSettings();
  const email = useUpdateNotificationSettings();

  return (
    <div className="flex flex-col gap-1">
      <ToggleRow
        id={inAppId}
        label="In-app notifications"
        description="Show alerts in Sentinel AI."
        checked={notifications.inAppEnabled}
        disabled={inApp.isPending}
        error={inApp.error}
        onChange={(checked) => {
          inApp.updateNotifications({ inAppEnabled: checked }).catch(() => {
            // The checkbox's `checked` prop is driven directly from the
            // query cache, which a rejected mutation never touches -- it
            // naturally reflects the prior server-confirmed value again,
            // with no local state to roll back.
          });
        }}
      />
      <ToggleRow
        id={emailId}
        label="Email notifications"
        description="Receive email alerts when Sentinel AI detects or resolves website, SEO, or performance issues."
        checked={notifications.emailEnabled}
        disabled={email.isPending}
        error={email.error}
        onChange={(checked) => {
          email.updateNotifications({ emailEnabled: checked }).catch(() => {});
        }}
      />
      <EmailDeliveryStatusRow latest={notifications.emailDelivery.latest} />
    </div>
  );
}
