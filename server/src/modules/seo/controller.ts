import { Request, Response } from "express";
import { seoService } from "./service";
import { seoValidation } from "./validation";
import { ValidationError } from "../../errors/AppError";

// Kept thin per project convention (mirrors performance/monitor
// controllers): no Prisma, no fetch/parsing, no issue derivation here —
// the service already owns ownership verification, orchestration, and
// read-time analysis composition.
export const seoController = {
  runCheck: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = seoValidation.validatePageUrlBody(req.body);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const check = await seoService.runSeoCheck(id, req.user!.userId, result.pageUrl);

    res.status(201).json({ success: true, check });
  },
  getLatest: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = seoValidation.validatePageUrlQuery(req.query);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const { check, analysis, pageUrl } = await seoService.getLatest(
      id,
      req.user!.userId,
      result.pageUrl
    );

    res.status(200).json({ success: true, check, analysis, pageUrl });
  },
  getHistory: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = seoValidation.validatePageUrlQuery(req.query);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const history = await seoService.getHistory(id, req.user!.userId, result.pageUrl);

    res.status(200).json({ success: true, ...history });
  },
};
