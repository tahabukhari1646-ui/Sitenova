import { apiFetch } from "@/lib/api-client";
import type {
  SettingsResult,
  UpdateAccountInput,
  UpdateAppearanceInput,
  UpdateNotificationsInput,
} from "./types";

export function getSettings(): Promise<SettingsResult> {
  return apiFetch<SettingsResult>("/settings");
}

export function updateAccountSettings(
  input: UpdateAccountInput
): Promise<SettingsResult> {
  return apiFetch<SettingsResult>("/settings/account", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// Each call sends only the ONE preference actually being toggled -- the
// backend's true PATCH semantics (omitted field left unchanged) is what
// guarantees toggling one preference can never reset the other, not
// anything this function does.
export function updateNotificationSettings(
  input: UpdateNotificationsInput
): Promise<SettingsResult> {
  return apiFetch<SettingsResult>("/settings/notifications", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateAppearanceSettings(
  input: UpdateAppearanceInput
): Promise<SettingsResult> {
  return apiFetch<SettingsResult>("/settings/appearance", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
