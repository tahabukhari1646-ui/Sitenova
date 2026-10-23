import { Request, Response } from "express";
import { aiAnalysisService } from "./service";

// Kept thin per project convention (mirrors performance/seo/monitor
// controllers): no Prisma, no provider logic, no ownership checks here --
// the service already owns ownership verification and orchestration.

// Stage 18.7: `?force=true` skips the free reuse step (never the cooldown or
// daily limit). Only the exact string "true" counts; anything else is false.
function readForce(req: Request): boolean {
  return req.query.force === "true";
}

// Stage 18.7: a NEW analysis is 201 (created); a REUSED identical analysis
// is 200 (no row created). The response body shape is identical either way.
function manualStatus(reused: boolean): number {
  return reused ? 200 : 201;
}

export const aiAnalysisController = {
  analyzePerformanceCheck: async (req: Request<{ id: string; checkId: string }>, res: Response) => {
    const { id, checkId } = req.params;

    const { analysis, reused } = await aiAnalysisService.analyzePerformanceCheck(id, checkId, req.user!.userId, {
      force: readForce(req),
    });

    res.status(manualStatus(reused)).json({ success: true, analysis });
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

    const { analysis, reused } = await aiAnalysisService.analyzeSeoCheck(id, checkId, req.user!.userId, {
      force: readForce(req),
    });

    res.status(manualStatus(reused)).json({ success: true, analysis });
  },
  // Stage 18.3: read-only. `analysis` is null (200) when there is none yet.
  getLatestSeoAnalysis: async (req: Request<{ id: string; checkId: string }>, res: Response) => {
    const { id, checkId } = req.params;

    const analysis = await aiAnalysisService.getLatestSeoAnalysis(id, checkId, req.user!.userId);

    res.status(200).json({ success: true, analysis });
  },
  // Stage 18.5: manual uptime diagnosis of one stored incident.
  analyzeIncident: async (req: Request<{ id: string; incidentId: string }>, res: Response) => {
    const { id, incidentId } = req.params;

    const { analysis, reused } = await aiAnalysisService.analyzeIncident(id, incidentId, req.user!.userId, {
      force: readForce(req),
    });

    res.status(manualStatus(reused)).json({ success: true, analysis });
  },
  // Stage 18.5: read-only. `analysis` is null (200) when there is none yet.
  getLatestIncidentAnalysis: async (
    req: Request<{ id: string; incidentId: string }>,
    res: Response
  ) => {
    const { id, incidentId } = req.params;

    const analysis = await aiAnalysisService.getLatestIncidentAnalysis(id, incidentId, req.user!.userId);

    res.status(200).json({ success: true, analysis });
  },
};
