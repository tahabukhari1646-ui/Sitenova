import { notificationRepository } from "./repository";
import { NotFoundError } from "../../errors/AppError";
import type { NotificationStatusFilter } from "./types";

export const notificationService = {
  // Global, user-scoped (never website-scoped) — req.user.userId only,
  // never a client-supplied userId. `unread` is always the true global
  // unread count regardless of `status` (Stage 15.6 §20/§24).
  list: async (userId: string, status: NotificationStatusFilter) => {
    const [notifications, total, unread] = await Promise.all([
      notificationRepository.findByUserId(userId, status),
      notificationRepository.countByUserId(userId, status),
      notificationRepository.countUnreadByUserId(userId),
    ]);

    return { notifications, total, unread, truncated: total > notifications.length };
  },
  // Idempotent: an already-read Notification is returned as-is (its
  // original readAt preserved) rather than re-stamped with a new
  // timestamp on a repeat call (Stage 15.6 §21).
  markOneRead: async (id: string, userId: string) => {
    const existing = await notificationRepository.findOwnedById(id, userId);

    if (!existing) {
      throw new NotFoundError(`Notification with id '${id}' not found.`);
    }

    if (existing.readAt !== null) {
      return existing;
    }

    return notificationRepository.markRead(id);
  },
  // One updateMany scoped to this user's currently-unread rows — already-
  // read rows are excluded by the query itself, so their original readAt
  // is never rewritten (Stage 15.6 §22).
  markAllRead: async (userId: string) => {
    const result = await notificationRepository.markAllRead(userId);
    return { updated: result.count };
  },
};
