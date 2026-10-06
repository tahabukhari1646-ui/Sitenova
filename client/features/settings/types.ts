// Stage 16.8: mirrors server/src/modules/settings/types.ts field-for-field.
// Stage 16.9: extended with Appearance (theme preference).

export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";

export interface SettingsAccount {
  name: string;
  // Read-only in this stage -- no email-verification flow exists yet
  // (Stage 16.8 §9). Displayed, never submitted for update.
  email: string;
}

export interface SettingsNotifications {
  inAppEnabled: boolean;
  emailEnabled: boolean;
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
