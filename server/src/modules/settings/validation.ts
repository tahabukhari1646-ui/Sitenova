import type { UpdateAccountInput, UpdateAppearanceInput, UpdateNotificationsInput } from "./types";
import type { ThemePreference } from "../../generated/prisma/client";

// No prior MAX length existed anywhere for User.name (auth/validation.ts's
// own validateRegister only checks non-empty) -- this stage adds one for
// Settings' own update path specifically, per Stage 16.8 §8's explicit
// "reasonable max length" requirement; auth registration is left
// unchanged (out of this stage's scope).
export const MAX_NAME_LENGTH = 100;

type AccountValidationResult =
  | { valid: true; data: UpdateAccountInput }
  | { valid: false; error: string };

type NotificationsValidationResult =
  | { valid: true; data: UpdateNotificationsInput }
  | { valid: false; error: string };

type AppearanceValidationResult =
  | { valid: true; data: UpdateAppearanceInput }
  | { valid: false; error: string };

const VALID_THEMES: readonly ThemePreference[] = ["SYSTEM", "LIGHT", "DARK"];

export const settingsValidation = {
  validateUpdateAccount: (body: unknown): AccountValidationResult => {
    if (typeof body !== "object" || body === null) {
      return { valid: false, error: "Request body must be an object." };
    }

    // Only ever reads `name` -- any other key on the body (passwordHash,
    // role, id, createdAt, email, ...) is simply never looked at, mirroring
    // every other module's existing validateCreate/validateUpdate
    // convention (website/validation.ts, seo/validation.ts) of destructuring
    // only known fields rather than rejecting unknown ones.
    const { name } = body as Record<string, unknown>;

    if (typeof name !== "string" || name.trim().length === 0) {
      return { valid: false, error: "'name' is required and must be a non-empty string." };
    }

    const trimmed = name.trim();
    if (trimmed.length > MAX_NAME_LENGTH) {
      return { valid: false, error: `'name' must be at most ${MAX_NAME_LENGTH} characters.` };
    }

    return { valid: true, data: { name: trimmed } };
  },
  validateUpdateNotifications: (body: unknown): NotificationsValidationResult => {
    if (typeof body !== "object" || body === null) {
      return { valid: false, error: "Request body must be an object." };
    }

    const { inAppEnabled, emailEnabled } = body as Record<string, unknown>;

    // Strict boolean check -- "true", 1, null, {} are all rejected rather
    // than coerced (Stage 16.8 §41/§22) -- this codebase does not coerce
    // types elsewhere (e.g. website/validation.ts's own isActive is passed
    // straight through with no Boolean() cast), so this stays consistent.
    if (inAppEnabled !== undefined && typeof inAppEnabled !== "boolean") {
      return { valid: false, error: "'inAppEnabled' must be a boolean if provided." };
    }

    if (emailEnabled !== undefined && typeof emailEnabled !== "boolean") {
      return { valid: false, error: "'emailEnabled' must be a boolean if provided." };
    }

    if (inAppEnabled === undefined && emailEnabled === undefined) {
      return {
        valid: false,
        error: "At least one field (inAppEnabled, emailEnabled) must be provided.",
      };
    }

    return { valid: true, data: { inAppEnabled, emailEnabled } };
  },
  // Exactly one of SYSTEM/LIGHT/DARK -- a strict enum membership check,
  // never a coercion ("dark-mode", "blue", true, 1, null, {} are all
  // rejected, matching validateUpdateNotifications' own no-coercion
  // discipline above).
  validateUpdateAppearance: (body: unknown): AppearanceValidationResult => {
    if (typeof body !== "object" || body === null) {
      return { valid: false, error: "Request body must be an object." };
    }

    const { theme } = body as Record<string, unknown>;

    if (typeof theme !== "string" || !VALID_THEMES.includes(theme as ThemePreference)) {
      return { valid: false, error: `'theme' must be one of: ${VALID_THEMES.join(", ")}.` };
    }

    return { valid: true, data: { theme: theme as ThemePreference } };
  },
};
