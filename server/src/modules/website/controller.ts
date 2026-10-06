import { Request, Response } from "express";
import { websiteValidation } from "./validation";
import { websiteService } from "./service";
import { ValidationError } from "../../errors/AppError";

export const websiteController = {
  create: async (req: Request, res: Response) => {
    const result = websiteValidation.validateCreate(req.body);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const website = await websiteService.create(result.data, req.user!.userId);

    res.status(201).json({ success: true, website });
  },
  getAll: async (req: Request, res: Response) => {
    const websites = await websiteService.getAll(req.user!.userId);

    res.status(200).json({ success: true, websites });
  },
  getById: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const website = await websiteService.getById(id, req.user!.userId);

    res.status(200).json({ success: true, website });
  },
  update: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = websiteValidation.validateUpdate(req.body);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const website = await websiteService.update(id, req.user!.userId, result.data);

    res.status(200).json({ success: true, website });
  },
  delete: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const website = await websiteService.delete(id, req.user!.userId);

    res.status(200).json({ success: true, website });
  },
};
