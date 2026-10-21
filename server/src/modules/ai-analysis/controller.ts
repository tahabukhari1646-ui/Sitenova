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
  // Stage 18.2: read-only. `analysis` is null (200, not 404) when the check
  // has no valid SUCCEEDED analysis yet.
  getLatestPerformanceAnalysis: async (
    req: Request<{ id: string; checkId: string }>,
    res: Response
  ) => {
    const { id, checkId } = req.params;

    const analysis = await aiAnalysisService.getLatestPerformanceAnalysis(id, checkId, req.user!.userId);

    res.status(200).json({ success: true, analysis });
  },
  // Stage 18.3: manual SEO diagnosis of one stored SeoCheck.
  analyzeSeoCheck: async (req: Request<{ id: string; checkId: string }>, res: Response) => {
    const { id, checkId } = req.params;

    const analysis = await aiAnalysisService.analyzeSeoCheck(id, checkId, req.user!.userId);

    res.status(201).json({ success: true, analysis });
  },
  // Stage 18.3: read-only. `analysis` is null (200) when there is none yet.
  getLatestSeoAnalysis: async (req: Request<{ id: string; checkId: string }>, res: Response) => {
    const { id, checkId } = req.params;

    const analysis = await aiAnalysisService.getLatestSeoAnalysis(id, checkId, req.user!.userId);

    res.status(200).json({ success: true, analysis });
  },
};
