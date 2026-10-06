// Stage 16.8: provider-independent Settings contracts. V1 scope is
// Account (name, read-only email) + Notification preferences only -- no
// password management, no email verification, no profile fields beyond
// what User already stores (Stage 16.8 §7/§8/§9/§10).
// Stage 16.9: extended with Appearance (theme preference).

export { ThemePreference } from "../../generated/prisma/client";
import type { ThemePreference } from "../../generated/prisma/client";

export interface SettingsAccountDto {
  name: string;
  // Read-only in this stage -- see settings/service.ts's own doc comment
  // for why (no email-verification flow exists yet).
  email: string;
}

// Stage 17.6: read-only visibility into the user's most recent email
// delivery. Deliberately minimal -- no provider, providerMessageId,
// lastErrorCode, recipient, or content is ever exposed. Timestamps are
// serialized as ISO strings by res.json().
export type SettingsEmailDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

export interface SettingsLatestEmailDeliveryDto {
  status: SettingsEmailDeliveryStatus;
  createdAt: Date;
  claimedAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
}

export interface SettingsNotificationsDto {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  // null = the user has no EmailDelivery rows yet (not an error).
  emailDelivery: { latest: SettingsLatestEmailDeliveryDto | null };
}

export interface SettingsAppearanceDto {
  theme: ThemePreference;
}

export interface SettingsDto {
  account: SettingsAccountDto;
  notifications: SettingsNotificationsDto;
  appearance: SettingsAppearanceDto;
}

export interface UpdateAccountInput {
  name: string;
}

// Both optional -- true PATCH semantics: an omitted field leaves that one
// preference unchanged. At least one of the two must be present (enforced
// in validation.ts), mirroring website/validation.ts's own
// validateUpdate "at least one field" convention.
export interface UpdateNotificationsInput {
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
}

export interface UpdateAppearanceInput {
  theme: ThemePreference;
}
