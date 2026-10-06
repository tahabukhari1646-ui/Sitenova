import { prisma } from "../../config/prisma";
import type { UpdateNotificationsInput } from "./types";
import type { ThemePreference } from "../../generated/prisma/client";

// Explicit select only, never the full User row -- passwordHash must never
// leave this layer (Stage 16.8 §30/§34). This is the ONE authoritative
// place Settings reads/writes User; no second preference store exists
// anywhere else (Stage 16.8 §36, Stage 16.9 §3).
const SETTINGS_SELECT = {
  id: true,
  name: true,
  email: true,
  inAppNotificationsEnabled: true,
  emailNotificationsEnabled: true,
  themePreference: true,
} as const;

export const settingsRepository = {
  findById: (userId: string) => {
    return prisma.user.findUnique({ where: { id: userId }, select: SETTINGS_SELECT });
  },
  // Explicit allow-listed field only -- never `data: req.body` (Stage 16.8
  // §34). Email is never written here; it has no update path in this
  // stage at all (Stage 16.8 §9).
  updateName: (userId: string, name: string) => {
    return prisma.user.update({
      where: { id: userId },
      data: { name },
      select: SETTINGS_SELECT,
    });
  },
  // Partial by construction -- only the keys actually present in `data`
  // are included in the Prisma `data` object, so an omitted field is never
  // touched (true PATCH semantics, Stage 16.8 §22/§23). Updating one
  // preference can never reset the other, and this method never touches
  // `name`/`email` at all.
  updateNotifications: (userId: string, data: UpdateNotificationsInput) => {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.inAppEnabled !== undefined && { inAppNotificationsEnabled: data.inAppEnabled }),
        ...(data.emailEnabled !== undefined && { emailNotificationsEnabled: data.emailEnabled }),
      },
      select: SETTINGS_SELECT,
    });
  },
  // A single scalar write -- never touches name/email/notification
  // preferences (Stage 16.9 §28's explicit "theme work must not reset
  // notification preferences" requirement).
  updateTheme: (userId: string, theme: ThemePreference) => {
    return prisma.user.update({
      where: { id: userId },
      data: { themePreference: theme },
      select: SETTINGS_SELECT,
    });
  },
};
