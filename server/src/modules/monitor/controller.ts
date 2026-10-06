import { Request, Response } from "express";
import { monitorService } from "./service";
import { monitorValidation } from "./validation";
import { ValidationError } from "../../errors/AppError";

export const monitorController = {
  getHistory: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = monitorValidation.validateHistoryRange(req.query);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const { checks, stats, status } = await monitorService.getHistory(
      id,
      req.user!.userId,
      result.range
    );

    res.status(200).json({ success: true, checks, stats, status });
  },
  getLatest: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const { check, status } = await monitorService.getLatest(id, req.user!.userId);

    res.status(200).json({ success: true, check, status });
  },
  runManualCheck: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const check = await monitorService.runManualCheck(id, req.user!.userId);

    res.status(201).json({ success: true, check });
  },
  getIncidents: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = monitorValidation.validateIncidentStatus(req.query);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const incidents = await monitorService.getIncidents(
      id,
      req.user!.userId,
      result.status
    );

    res.status(200).json({ success: true, incidents });
  },
  getAlerts: async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const result = monitorValidation.validateAlertFilters(req.query);

    if (!result.valid) {
      throw new ValidationError(result.error);
    }

    const { alerts, total, truncated } = await monitorService.getAlerts(
      id,
      req.user!.userId,
      result.filters
    );

    res.status(200).json({ success: true, alerts, total, truncated });
  },
};
