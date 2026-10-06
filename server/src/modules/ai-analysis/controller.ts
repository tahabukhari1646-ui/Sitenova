import { Request, Response } from "express";
import { aiAnalysisService } from "./service";

// Kept thin per project convention (mirrors performance/seo/monitor
// controllers): no Prisma, no provider logic, no ownership checks here --
// the service already owns ownership verification and orchestration.
export const aiAnalysisController = {
  analyzePerformanceCheck: async (req: Request<{ id: string; checkId: string }>, res: Response) => {
    const { id, checkId } = req.params;

    const analysis = await aiAnalysisService.analyzePerformanceCheck(id, checkId, req.user!.userId);

    res.status(201).json({ success: true, analysis });
  },
};
