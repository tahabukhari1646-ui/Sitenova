import { settingsRepository } from "./repository";
import { NotFoundError } from "../../errors/AppError";
import type {
  SettingsDto,
  UpdateAccountInput,
  UpdateAppearanceInput,
  UpdateNotificationsInput,
} from "./types";
import type { ThemePreference } from "../../generated/prisma/client";

function toDto(user: {
  name: string;
  email: string;
  inAppNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  themePreference: ThemePreference;
}): SettingsDto {
  return {
    account: { name: user.name, email: user.email },
    notifications: {
      inAppEnabled: user.inAppNotificationsEnabled,
      emailEnabled: user.emailNotificationsEnabled,
    },
    appearance: { theme: user.themePreference },
  };
}

// Every method here takes a trusted `userId` only (always req.user.userId
// from the verified JWT, per authenticate middleware) -- never a
// client-supplied id anywhere in this module (Stage 16.8 §19). There is no
// userId route param for Settings at all, so the "another user's id in the
// URL" attack surface does not exist by construction, not merely by a
// runtime check.
export const settingsService = {
  get: async (userId: string): Promise<SettingsDto> => {
    const user = await settingsRepository.findById(userId);

    // Defensive only -- an authenticated request always carries a userId
    // from a previously-issued, still-valid JWT, so the row should always
    // exist. Mirrors every other module's "ownership lookup returned
    // nothing" handling rather than assuming it can't happen.
    if (!user) {
      throw new NotFoundError("User not found.");
    }

    return toDto(user);
  },
  // Email has no update path in this stage (Stage 16.8 §9: no
  // email-verification flow exists yet, so changing the login identity
  // here would risk creating an unverified/unreachable account). Only
  // `name` is ever written.
  updateAccount: async (userId: string, input: UpdateAccountInput): Promise<SettingsDto> => {
    const user = await settingsRepository.updateName(userId, input.name);
    return toDto(user);
  },
  // `emailEnabled` is persisted ONLY -- this method never sends email,
  // queues email, or calls any external provider (Stage 16.8 §12/§18).
  // Stage 17 is the first code that will ever read this value to decide
  // whether to actually deliver anything.
  updateNotifications: async (
    userId: string,
    input: UpdateNotificationsInput
  ): Promise<SettingsDto> => {
    const user = await settingsRepository.updateNotifications(userId, input);
    return toDto(user);
  },
  // Stage 16.9: resolving SYSTEM into an actual light/dark appearance is a
  // client-only concern (prefers-color-scheme) -- this method only ever
  // persists the user's raw choice, never resolves or interprets it.
  updateAppearance: async (userId: string, input: UpdateAppearanceInput): Promise<SettingsDto> => {
    const user = await settingsRepository.updateTheme(userId, input.theme);
    return toDto(user);
  },
};
