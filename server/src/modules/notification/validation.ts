import type { NotificationStatusFilter } from "./types";

const VALID_STATUSES: NotificationStatusFilter[] = ["ALL", "READ", "UNREAD"];

type StatusValidationResult =
  | { valid: true; status: NotificationStatusFilter }
  | { valid: false; error: string };

export const notificationValidation = {
  validateStatus: (query: unknown): StatusValidationResult => {
    const raw = (query as Record<string, unknown> | undefined)?.status;

    if (raw === undefined) {
      return { valid: true, status: "ALL" };
    }

    if (typeof raw !== "string" || !VALID_STATUSES.includes(raw as NotificationStatusFilter)) {
      return {
        valid: false,
        error: `'status' must be one of: ${VALID_STATUSES.join(", ")}.`,
      };
    }

    return { valid: true, status: raw as NotificationStatusFilter };
  },
};
