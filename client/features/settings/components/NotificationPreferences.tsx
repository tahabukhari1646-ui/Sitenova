"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import { useUpdateNotificationSettings } from "../hooks";
import type { SettingsNotifications } from "../types";

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
        description="Allow email alerts once email delivery is available. No emails are sent yet."
        checked={notifications.emailEnabled}
        disabled={email.isPending}
        error={email.error}
        onChange={(checked) => {
          email.updateNotifications({ emailEnabled: checked }).catch(() => {});
        }}
      />
    </div>
  );
}
