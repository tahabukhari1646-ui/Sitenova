import { Request, Response } from "express";
import { performanceService } from "./service";
import { performanceValidation } from "./validation";
import { ValidationError } from "../../errors/AppError";

export const performanceController = {
  runCheck: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = performanceValidation.validateStrategyBody(req.body);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const check = await performanceService.runCheck(
      id,
      req.user!.userId,
      result.strategy,
      result.pageUrl
    );

    res.status(201).json({ success: true, check });
  },
  getLatest: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = performanceValidation.validateStrategyQuery(req.query);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const { check, pageUrl } = await performanceService.getLatest(
      id,
      req.user!.userId,
      result.strategy,
      result.pageUrl
    );

    res.status(200).json({ success: true, check, pageUrl });
  },
  getHistory: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = performanceValidation.validateHistoryQuery(req.query);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const history = await performanceService.getHistory(
      id,
      req.user!.userId,
      result.strategy,
      result.range,
      result.pageUrl
    );

    res.status(200).json({ success: true, ...history });
  },
  getStats: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = performanceValidation.validateRequiredStrategyQuery(req.query);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const stats = await performanceService.getStats(
      id,
      req.user!.userId,
      result.strategy,
      result.pageUrl
    );

    res.status(200).json({ success: true, stats });
  },
};
