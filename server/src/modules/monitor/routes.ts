import { Router } from "express";
import { monitorController } from "./controller";
import { authenticate } from "../../middlewares/auth";

const router = Router();

router.use(authenticate);

router.get("/:id/checks", monitorController.getHistory);
router.get("/:id/latest", monitorController.getLatest);
router.post("/:id/check", monitorController.runManualCheck);
router.get("/:id/incidents", monitorController.getIncidents);
router.get("/:id/alerts", monitorController.getAlerts);

export default router;
