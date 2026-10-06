import { settingsRepository } from "./repository";
import { emailDeliveryRepository } from "../email-delivery/repository";
import { NotFoundError } from "../../errors/AppError";
import type {
  SettingsDto,
  SettingsLatestEmailDeliveryDto,
  UpdateAccountInput,
  UpdateAppearanceInput,
  UpdateNotificationsInput,
} from "./types";
import type { ThemePreference } from "../../generated/prisma/client";

function toDto(
  user: {
    name: string;
    email: string;
    inAppNotificationsEnabled: boolean;
    emailNotificationsEnabled: boolean;
    themePreference: ThemePreference;
  },
  latestEmailDelivery: SettingsLatestEmailDeliveryDto | null
): SettingsDto {
  return {
    account: { name: user.name, email: user.email },
    notifications: {
      inAppEnabled: user.inAppNotificationsEnabled,
      emailEnabled: user.emailNotificationsEnabled,
      emailDelivery: { latest: latestEmailDelivery },
    },
    appearance: { theme: user.themePreference },
  };
}

// Stage 17.6: every method -- GET and all three PATCHes -- returns the
// COMPLETE SettingsDto, including notifications.emailDelivery.latest. The
// frontend replaces its Settings query cache with each PATCH response
// (client/features/settings/hooks.ts), so a PATCH response missing this
// field would wipe the delivery status from the UI. The latest-delivery
// read is independent of the user write, so both run in parallel.
//
// Every method here takes a trusted `userId` only (always req.user.userId
// from the verified JWT, per authenticate middleware) -- never a
// client-supplied id anywhere in this module (Stage 16.8 §19). There is no
// userId route param for Settings at all, so the "another user's id in the
// URL" attack surface does not exist by construction, not merely by a
// runtime check.
export const settingsService = {
  get: async (userId: string): Promise<SettingsDto> => {
    const [user, latest] = await Promise.all([
      settingsRepository.findById(userId),
      emailDeliveryRepository.findLatestForUser(userId),
    ]);

    // Defensive only -- an authenticated request always carries a userId
    // from a previously-issued, still-valid JWT, so the row should always
    // exist. Mirrors every other module's "ownership lookup returned
    // nothing" handling rather than assuming it can't happen.
    if (!user) {
      throw new NotFoundError("User not found.");
    }

    return toDto(user, latest);
  },
  // Email has no update path in this stage (Stage 16.8 §9: no
  // email-verification flow exists yet, so changing the login identity
  // here would risk creating an unverified/unreachable account). Only
  // `name` is ever written.
  updateAccount: async (userId: string, input: UpdateAccountInput): Promise<SettingsDto> => {
    const [user, latest] = await Promise.all([
      settingsRepository.updateName(userId, input.name),
      emailDeliveryRepository.findLatestForUser(userId),
    ]);
    return toDto(user, latest);
  },
  // `emailEnabled` is persisted ONLY -- this method never sends email,
  // queues email, or calls any external provider (Stage 16.8 §12/§18).
  // From Stage 17.3 on, the value is read at Alert-creation time to decide
  // whether an EmailDelivery intent is created; changing it here never
  // affects deliveries that were already queued.
  updateNotifications: async (
    userId: string,
    input: UpdateNotificationsInput
  ): Promise<SettingsDto> => {
    const [user, latest] = await Promise.all([
      settingsRepository.updateNotifications(userId, input),
      emailDeliveryRepository.findLatestForUser(userId),
    ]);
    return toDto(user, latest);
  },
  // Stage 16.9: resolving SYSTEM into an actual light/dark appearance is a
  // client-only concern (prefers-color-scheme) -- this method only ever
  // persists the user's raw choice, never resolves or interprets it.
  updateAppearance: async (userId: string, input: UpdateAppearanceInput): Promise<SettingsDto> => {
    const [user, latest] = await Promise.all([
      settingsRepository.updateTheme(userId, input.theme),
      emailDeliveryRepository.findLatestForUser(userId),
    ]);
    return toDto(user, latest);
  },
};
