import { Request, Response } from "express";
import { settingsService } from "./service";
import { settingsValidation } from "./validation";
import { ValidationError } from "../../errors/AppError";

// Kept thin per project convention (mirrors performance/seo/notification
// controllers): no Prisma, no business logic here.
export const settingsController = {
  get: async (req: Request, res: Response) => {
    const settings = await settingsService.get(req.user!.userId);
    res.status(200).json({ success: true, settings });
  },
  updateAccount: async (req: Request, res: Response) => {
    const result = settingsValidation.validateUpdateAccount(req.body);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const settings = await settingsService.updateAccount(req.user!.userId, result.data);
    res.status(200).json({ success: true, settings });
  },
  updateNotifications: async (req: Request, res: Response) => {
    const result = settingsValidation.validateUpdateNotifications(req.body);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const settings = await settingsService.updateNotifications(req.user!.userId, result.data);
    res.status(200).json({ success: true, settings });
  },
  updateAppearance: async (req: Request, res: Response) => {
    const result = settingsValidation.validateUpdateAppearance(req.body);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const settings = await settingsService.updateAppearance(req.user!.userId, result.data);
    res.status(200).json({ success: true, settings });
  },
};
