// Stage 16.8: mirrors server/src/modules/settings/types.ts field-for-field.
// Stage 16.9: extended with Appearance (theme preference).

export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";

export interface SettingsAccount {
  name: string;
  // Read-only in this stage -- no email-verification flow exists yet
  // (Stage 16.8 §9). Displayed, never submitted for update.
  email: string;
}

// Stage 17.6: mirrors the backend's minimal read model -- never includes
// provider, providerMessageId, lastErrorCode, recipient, or content.
export type EmailDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

export interface LatestEmailDelivery {
  status: EmailDeliveryStatus;
  createdAt: string;
  claimedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
}

export interface SettingsNotifications {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  // latest = null means no email alerts have been processed yet.
  emailDelivery: { latest: LatestEmailDelivery | null };
}

export interface SettingsAppearance {
  theme: ThemePreference;
}

export interface SettingsResult {
  settings: {
    account: SettingsAccount;
    notifications: SettingsNotifications;
    appearance: SettingsAppearance;
  };
}

export interface UpdateAccountInput {
  name: string;
}

export interface UpdateNotificationsInput {
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
}

export interface UpdateAppearanceInput {
  theme: ThemePreference;
}
