import { Request, Response } from "express";
import { notificationService } from "./service";
import { notificationValidation } from "./validation";
import { ValidationError } from "../../errors/AppError";

// Kept thin per project convention (mirrors monitor/seo/performance
// controllers): no Prisma, no business logic here.
export const notificationController = {
  list: async (req: Request, res: Response) => {
    const result = notificationValidation.validateStatus(req.query);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const { notifications, total, unread, truncated } = await notificationService.list(
      req.user!.userId,
      result.status
    );

    res.status(200).json({ success: true, notifications, total, unread, truncated });
  },
  markOneRead: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const notification = await notificationService.markOneRead(id, req.user!.userId);

    res.status(200).json({
      success: true,
      notification: { id: notification.id, readAt: notification.readAt },
    });
  },
  markAllRead: async (req: Request, res: Response) => {
    const { updated } = await notificationService.markAllRead(req.user!.userId);

    res.status(200).json({ success: true, updated });
  },
};
